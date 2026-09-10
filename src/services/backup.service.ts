/**
 * Service layer (portability rule 3.1): full-database backup/export logic
 * (spec §12, portability rule 3.3, docs/migration-guide-to-vps.md §2 —
 * "Export the current schema + data using the built-in backup endpoint:
 * POST /admin/export/backup ... It emits one JSON file per table plus a
 * schema.sql dump.").
 *
 * Output format: a single ZIP-free "manifest" archive is NOT built here —
 * to stay within Workers CPU limits and keep this portable (no zip lib
 * required), we build ONE JSON document containing:
 *   { generatedAt, schemaSql, tables: { <tableName>: <rows[]> } }
 * This is exactly "one JSON export per table plus a schema.sql dump",
 * just bundled as a single downloadable file instead of many small ones —
 * simpler to store/sign/download as one R2 object, and trivially
 * splittable by a future importer script (see migration-guide-to-vps.md).
 */
import type { BackupRepository } from '../repositories/backup.repository'

export interface BackupManifest {
  generatedAt: string
  schemaSql: string
  tables: Record<string, Record<string, unknown>[]>
}

export interface BackupService {
  buildBackup(): Promise<BackupManifest>
}

export function createBackupService(repo: BackupRepository): BackupService {
  return {
    async buildBackup() {
      const [tableNames, schemaSql] = await Promise.all([repo.listTableNames(), repo.getSchemaSql()])

      const tables: Record<string, Record<string, unknown>[]> = {}
      // Sequential, not Promise.all — D1 rate-limits/serializes better this
      // way and this is an infrequent admin-only operation, not a hot path.
      for (const tableName of tableNames) {
        tables[tableName] = await repo.dumpTable(tableName)
      }

      return {
        generatedAt: new Date().toISOString(),
        schemaSql,
        tables,
      }
    },
  }
}
