import { describe, it, expect } from 'vitest'
import { createAuthzService } from '../src/services/authz.service'
import { R2StorageService } from '../src/adapters/storage/r2.storage-service'
import type { RoleRepository } from '../src/repositories/role.repository'

/**
 * Security-focused tests for the backup feature (spec §12, portability
 * rule 3.3): "Auth: super_admin only".
 *
 * 1. AuthzService.hasPermission('system.export_backup') — the exact
 *    permission gate used by `requirePermission()` on
 *    `POST /admin/export/backup` (see src/routes/admin.ts) — must deny
 *    every non-super_admin role, including moderator/scientific_manager
 *    (who DO get `tools.manage`, but must NOT get backup access).
 * 2. R2StorageService's HMAC signed-URL scheme (the same mechanism that
 *    protects the returned backup download link, and every tool PDF
 *    download link) must reject expired and tampered signatures.
 */

describe('system.export_backup permission (super_admin-only gate)', () => {
  it('grants access to super_admin', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['super_admin'],
      getPermissionKeysForUser: async () => [],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'system.export_backup')).resolves.toBe(true)
  })

  it('denies moderator, even though moderator has tools.manage', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['moderator'],
      getPermissionKeysForUser: async () => ['tools.manage', 'moderation.view_queue'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'tools.manage')).resolves.toBe(true)
    await expect(authz.hasPermission(1, 'system.export_backup')).resolves.toBe(false)
  })

  it('denies scientific_manager', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['scientific_manager'],
      getPermissionKeysForUser: async () => ['tools.manage', 'audit.view', 'content.publish'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'system.export_backup')).resolves.toBe(false)
  })

  it('denies a plain member', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['member'],
      getPermissionKeysForUser: async () => ['question.create'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'system.export_backup')).resolves.toBe(false)
  })
})

describe('R2StorageService signed-URL scheme (protects backup + PDF download links)', () => {
  function fakeBucket(): R2Bucket {
    return {
      async head() {
        return {} as R2Object
      },
    } as unknown as R2Bucket
  }

  it('accepts its own freshly generated signature before expiry', async () => {
    const storage = new R2StorageService(fakeBucket(), 'test-secret')
    const url = await storage.getSignedUrl('backups/backup-123.json', 900)
    const match = url!.match(/\/files\/([^?]+)\?exp=(\d+)&sig=([a-f0-9]+)/)
    expect(match).not.toBeNull()
    const [, key, exp, sig] = match!
    const valid = await storage.verifySignedAccess(decodeURIComponent(key), Number(exp), sig)
    expect(valid).toBe(true)
  })

  it('rejects a signature after its expiry timestamp has passed', async () => {
    const storage = new R2StorageService(fakeBucket(), 'test-secret')
    const pastExpiry = Date.now() - 1000
    // Sign a key with an already-expired timestamp directly (bypassing
    // getSignedUrl's fresh Date.now()+ttl, to simulate an old stale link).
    const key = 'backups/old.json'
    const stillValidSig = await (storage as unknown as { sign: (k: string, e: number) => Promise<string> }).sign(key, pastExpiry)
    const valid = await storage.verifySignedAccess(key, pastExpiry, stillValidSig)
    expect(valid).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const storage = new R2StorageService(fakeBucket(), 'test-secret')
    const url = await storage.getSignedUrl('backups/backup-123.json', 900)
    const match = url!.match(/\/files\/([^?]+)\?exp=(\d+)&sig=([a-f0-9]+)/)
    const [, key, exp, sig] = match!
    const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a')
    const valid = await storage.verifySignedAccess(decodeURIComponent(key), Number(exp), tamperedSig)
    expect(valid).toBe(false)
  })

  it('rejects a signature for a different key than it was issued for', async () => {
    const storage = new R2StorageService(fakeBucket(), 'test-secret')
    const url = await storage.getSignedUrl('backups/backup-123.json', 900)
    const match = url!.match(/\/files\/([^?]+)\?exp=(\d+)&sig=([a-f0-9]+)/)
    const [, , exp, sig] = match!
    const valid = await storage.verifySignedAccess('backups/backup-999-other.json', Number(exp), sig)
    expect(valid).toBe(false)
  })

  it('produces different signatures when signed with different secrets', async () => {
    const storageA = new R2StorageService(fakeBucket(), 'secret-a')
    const storageB = new R2StorageService(fakeBucket(), 'secret-b')
    const urlA = await storageA.getSignedUrl('backups/x.json', 900)
    const matchA = urlA!.match(/\?exp=(\d+)&sig=([a-f0-9]+)/)!
    const validAgainstB = await storageB.verifySignedAccess('backups/x.json', Number(matchA[1]), matchA[2])
    expect(validAgainstB).toBe(false)
  })
})
