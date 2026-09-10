/**
 * Repository layer (portability rule 3.1/3.3): the ONLY place allowed to
 * run raw introspection SQL for the full-database backup feature
 * (spec §12, docs/migration-guide-to-vps.md §2 — `POST /admin/export/backup`).
 *
 * Unlike other repositories, this one is inherently dialect-specific
 * (SQLite `sqlite_master` introspection) because "dump every table + the
 * live schema" has no portable Drizzle query builder API — this is
 * explicitly called out in migration-guide-to-vps.md §2/§3: on a Postgres
 * VPS, this file is rewritten against `information_schema` instead, same
 * method signatures, same caller (BackupService) unchanged.
 */
import { sql } from 'drizzle-orm'
import type { Database } from '../db/client'

export interface BackupRepository {
  /** All user-table names (excludes SQLite-internal `sqlite_*` tables). */
  listTableNames(): Promise<string[]>
  /** Concatenated `CREATE TABLE`/`CREATE INDEX` statements for every table — the "schema.sql dump". */
  getSchemaSql(): Promise<string>
  /** Every row of one table, as plain JSON-serializable objects. */
  dumpTable(tableName: string): Promise<Record<string, unknown>[]>
}

/** Defends against SQL injection via a crafted table name — only names that came from listTableNames() should ever reach dumpTable(). */
function assertSafeIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`unsafe_table_identifier:${name}`)
  }
}

export function createBackupRepository(db: Database): BackupRepository {
  return {
    async listTableNames() {
      const rows = await db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
      )
      return rows.map((r) => r.name)
    },

    async getSchemaSql() {
      const rows = await db.all<{ sql: string | null }>(
        sql`SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql IS NOT NULL ORDER BY type DESC, name`,
      )
      return rows.map((r) => r.sql).filter(Boolean).join(';\n') + ';\n'
    },

    async dumpTable(tableName: string) {
      assertSafeIdentifier(tableName)
      const rows = await db.all<Record<string, unknown>>(sql`SELECT * FROM ${sql.identifier(tableName)}`)
      return rows
    },
  }
}
