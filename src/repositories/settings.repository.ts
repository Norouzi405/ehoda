/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `settings`. Values are stored as JSON text and
 * parsed here so callers work with plain objects (spec §12.1: admin-editable
 * defaults, no deploy required to change them).
 */
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { settings } from '../db/schema'

export interface SettingsRepository {
  getJson<T>(key: string, fallback: T): Promise<T>
}

export function createSettingsRepository(db: Database): SettingsRepository {
  return {
    async getJson<T>(key: string, fallback: T): Promise<T> {
      const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
      const row = rows[0]
      if (!row) return fallback
      try {
        return JSON.parse(row.valueJson) as T
      } catch {
        return fallback
      }
    },
  }
}
