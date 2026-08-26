/**
 * Database client factory.
 *
 * PORTABILITY (rule 3.1): this is the ONLY file in the codebase allowed to
 * know that we run on Cloudflare D1. Services and repositories receive a
 * `Database` instance (the drizzle wrapper type below) through dependency
 * injection (see src/lib/context.ts) and never import 'drizzle-orm/d1'
 * themselves. When migrating to a VPS, only this file and
 * drizzle.config.ts need to change to point at `drizzle-orm/node-postgres`
 * or `drizzle-orm/mysql2` — see docs/migration-guide-to-vps.md.
 */
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export type Database = ReturnType<typeof drizzle<typeof schema>>

export function createDb(d1: D1Database): Database {
  return drizzle(d1, { schema })
}
