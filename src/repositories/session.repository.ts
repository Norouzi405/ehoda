/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `sessions`.
 */
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { sessions } from '../db/schema'

export interface SessionRecord {
  id: number
  userId: number
  tokenHash: string
  expiresAt: string
}

export interface CreateSessionInput {
  userId: number
  tokenHash: string
  expiresAt: string
  userAgent?: string
  ipAddress?: string
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  touch(id: number, atIso: string): Promise<void>
  deleteByTokenHash(tokenHash: string): Promise<void>
}

export function createSessionRepository(db: Database): SessionRepository {
  return {
    async create(input: CreateSessionInput): Promise<void> {
      await db.insert(sessions).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      })
    },

    async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      const rows = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1)
      return (rows[0] as SessionRecord | undefined) ?? null
    },

    async touch(id: number, atIso: string): Promise<void> {
      await db.update(sessions).set({ lastSeenAt: atIso }).where(eq(sessions.id, id))
    },

    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    },
  }
}
