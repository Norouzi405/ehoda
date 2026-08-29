/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `otp_tokens`. Returns plain DTOs.
 */
import { eq, and, gte, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { otpTokens } from '../db/schema'

export interface OtpTokenRecord {
  id: number
  requestId: string
  phoneNumber: string
  codeHash: string
  purpose: string
  attempts: number
  maxAttempts: number
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export interface CreateOtpInput {
  requestId: string
  phoneNumber: string
  codeHash: string
  purpose: string
  ipAddress?: string
  deviceFingerprint?: string
  maxAttempts: number
  expiresAt: string
}

export interface OtpRepository {
  create(input: CreateOtpInput): Promise<void>
  findByRequestId(requestId: string): Promise<OtpTokenRecord | null>
  incrementAttempts(id: number): Promise<void>
  markConsumed(id: number, consumedAtIso: string): Promise<void>
  /** Count OTP requests for a phone number since a given ISO timestamp (rate-limit window). */
  countRecentByPhone(phoneNumber: string, sinceIso: string): Promise<number>
  /** Most recent OTP request row for a phone number, used for the resend cooldown check. */
  findLatestByPhone(phoneNumber: string): Promise<OtpTokenRecord | null>
}

export function createOtpRepository(db: Database): OtpRepository {
  return {
    async create(input: CreateOtpInput): Promise<void> {
      await db.insert(otpTokens).values({
        requestId: input.requestId,
        phoneNumber: input.phoneNumber,
        codeHash: input.codeHash,
        purpose: input.purpose,
        ipAddress: input.ipAddress,
        deviceFingerprint: input.deviceFingerprint,
        maxAttempts: input.maxAttempts,
        expiresAt: input.expiresAt,
      })
    },

    async findByRequestId(requestId: string): Promise<OtpTokenRecord | null> {
      const rows = await db.select().from(otpTokens).where(eq(otpTokens.requestId, requestId)).limit(1)
      return (rows[0] as OtpTokenRecord | undefined) ?? null
    },

    async incrementAttempts(id: number): Promise<void> {
      await db.update(otpTokens).set({ attempts: sql`${otpTokens.attempts} + 1` }).where(eq(otpTokens.id, id))
    },

    async markConsumed(id: number, consumedAtIso: string): Promise<void> {
      await db.update(otpTokens).set({ consumedAt: consumedAtIso }).where(eq(otpTokens.id, id))
    },

    async countRecentByPhone(phoneNumber: string, sinceIso: string): Promise<number> {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(otpTokens)
        .where(and(eq(otpTokens.phoneNumber, phoneNumber), gte(otpTokens.createdAt, sinceIso)))
      return Number(rows[0]?.count ?? 0)
    },

    async findLatestByPhone(phoneNumber: string): Promise<OtpTokenRecord | null> {
      const rows = await db
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.phoneNumber, phoneNumber))
        .orderBy(sql`${otpTokens.createdAt} DESC`)
        .limit(1)
      return (rows[0] as OtpTokenRecord | undefined) ?? null
    },
  }
}
