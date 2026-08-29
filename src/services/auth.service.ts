/**
 * Service layer (portability rule 3.1): session issuance/validation and
 * find-or-create-user-by-phone logic. Pure business logic, zero framework
 * imports — the Hono cookie read/write happens in src/middleware/auth.ts
 * and src/routes/auth.ts, never here.
 */
import type { UserRepository, UserRecord } from '../repositories/user.repository'
import type { SessionRepository } from '../repositories/session.repository'
import { sha256Hex, randomSessionToken } from '../lib/crypto'

const SESSION_TTL_DAYS = 30

export interface AuthService {
  /** Finds the user by phone, or creates a new member account (spec §8.1: OTP login doubles as signup). */
  findOrCreateUserByPhone(phoneNumber: string): Promise<{ user: UserRecord; isNewUser: boolean }>
  /** Issues a new session for a user; returns the raw token to be set as an HttpOnly cookie (never persisted in plaintext). */
  issueSession(userId: number, opts?: { userAgent?: string; ipAddress?: string }): Promise<{ token: string; expiresAt: string }>
  /** Resolves a raw cookie token back to a user id, or null if the session is missing/expired. */
  resolveSession(token: string): Promise<{ userId: number; sessionId: number } | null>
  revokeSession(token: string): Promise<void>
}

export function createAuthService(userRepo: UserRepository, sessionRepo: SessionRepository, clock: () => number = () => Date.now()): AuthService {
  return {
    async findOrCreateUserByPhone(phoneNumber) {
      const existing = await userRepo.findByPhone(phoneNumber)
      if (existing) {
        if (!existing.phoneVerifiedAt) {
          await userRepo.markPhoneVerified(existing.id, new Date(clock()).toISOString())
        }
        return { user: existing, isNewUser: false }
      }
      const created = await userRepo.createMemberWithProfile(phoneNumber, new Date(clock()).toISOString())
      return { user: created, isNewUser: true }
    },

    async issueSession(userId, opts) {
      const token = randomSessionToken()
      const tokenHash = await sha256Hex(token)
      const expiresAt = new Date(clock() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
      await sessionRepo.create({ userId, tokenHash, expiresAt, userAgent: opts?.userAgent, ipAddress: opts?.ipAddress })
      await userRepo.markLastLogin(userId, new Date(clock()).toISOString())
      return { token, expiresAt }
    },

    async resolveSession(token) {
      const tokenHash = await sha256Hex(token)
      const record = await sessionRepo.findByTokenHash(tokenHash)
      if (!record) return null
      if (Date.parse(record.expiresAt) < clock()) return null
      await sessionRepo.touch(record.id, new Date(clock()).toISOString())
      return { userId: record.userId, sessionId: record.id }
    },

    async revokeSession(token) {
      const tokenHash = await sha256Hex(token)
      await sessionRepo.deleteByTokenHash(tokenHash)
    },
  }
}
