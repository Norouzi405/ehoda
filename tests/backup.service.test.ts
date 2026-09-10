import { describe, it, expect } from 'vitest'
import { createBackupService } from '../src/services/backup.service'
import type { BackupRepository } from '../src/repositories/backup.repository'

/**
 * Unit test for BackupService (spec §12 — full DB export for VPS
 * migration). Uses a fake BackupRepository so this stays a pure,
 * DB-free test — access-control (super_admin-only) is exercised
 * separately in admin-backup-security.test.ts against the real
 * `requirePermission` middleware + AuthzService.
 */
function fakeRepo(tables: Record<string, Record<string, unknown>[]>, schemaSql = 'CREATE TABLE x (id INTEGER);'): BackupRepository {
  return {
    async listTableNames() {
      return Object.keys(tables)
    },
    async getSchemaSql() {
      return schemaSql
    },
    async dumpTable(tableName: string) {
      return tables[tableName] ?? []
    },
  }
}

describe('BackupService.buildBackup', () => {
  it('includes every table returned by listTableNames, with its rows', async () => {
    const service = createBackupService(
      fakeRepo({
        users: [{ id: 1, phone_number: '+98912...' }],
        tools: [{ id: 1, slug: 'family_media_contract' }],
      }),
    )
    const manifest = await service.buildBackup()
    expect(Object.keys(manifest.tables).sort()).toEqual(['tools', 'users'])
    expect(manifest.tables.users).toEqual([{ id: 1, phone_number: '+98912...' }])
    expect(manifest.tables.tools).toEqual([{ id: 1, slug: 'family_media_contract' }])
  })

  it('includes the schema.sql dump verbatim', async () => {
    const service = createBackupService(fakeRepo({}, 'CREATE TABLE users (id INTEGER PRIMARY KEY);'))
    const manifest = await service.buildBackup()
    expect(manifest.schemaSql).toBe('CREATE TABLE users (id INTEGER PRIMARY KEY);')
  })

  it('stamps a fresh ISO-8601 generatedAt timestamp', async () => {
    const service = createBackupService(fakeRepo({}))
    const before = Date.now()
    const manifest = await service.buildBackup()
    const stamped = new Date(manifest.generatedAt).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(Date.now())
  })

  it('produces an empty tables map when there are no user tables', async () => {
    const service = createBackupService(fakeRepo({}))
    const manifest = await service.buildBackup()
    expect(manifest.tables).toEqual({})
  })
})
