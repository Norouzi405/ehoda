/**
 * Admin / data-portability routes (spec §12, portability rule 3.3).
 * Mounted at the site root (not under /api) in src/index.tsx, matching
 * docs/api.md's documented path `POST /admin/export/backup`.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createBackupRepository } from '../repositories/backup.repository'
import { createBackupService } from '../services/backup.service'
import { requirePermission } from '../middleware/rbac'

export const adminRoute = new Hono<{ Bindings: Bindings }>()

/** How long the backup file's signed download link stays valid. */
const BACKUP_LINK_TTL_SECONDS = 60 * 15 // 15 minutes — sensitive full-DB export

// `system.export_backup` is granted ONLY to super_admin in seeders/seed.sql
// (unlike `tools.manage`, deliberately NOT extended to moderator/scientific_manager —
// a full raw database export is a materially different risk level than
// viewing tool submissions). requirePermission() also grants super_admin an
// implicit bypass regardless (see AuthzService), so this is defense in depth.
adminRoute.post('/admin/export/backup', requirePermission('system.export_backup'), async (c) => {
  const ctx = buildAppContext(c)
  const backupService = createBackupService(createBackupRepository(ctx.db))

  try {
    const manifest = await backupService.buildBackup()
    const json = JSON.stringify(manifest)
    const bytes = new TextEncoder().encode(json)

    const key = `backups/backup-${Date.now()}.json`
    await ctx.storage.put(key, bytes, 'application/json')

    const signedUrl = await ctx.storage.getSignedUrl(key, BACKUP_LINK_TTL_SECONDS)
    if (!signedUrl) return c.json({ error: 'backup_storage_failed' }, 500)

    return c.json({
      downloadUrl: signedUrl,
      expiresInSeconds: BACKUP_LINK_TTL_SECONDS,
      tableCount: Object.keys(manifest.tables).length,
      generatedAt: manifest.generatedAt,
    })
  } catch (err) {
    return c.json({ error: 'backup_failed', message: err instanceof Error ? err.message : 'unknown_error' }, 500)
  }
})
