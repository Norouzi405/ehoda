/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `users`/`profiles`/`model_has_roles`.
 */
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { users, profiles, modelHasRoles, roles, userRestrictions, notifications } from '../db/schema'

export interface UserRecord {
  id: number
  phoneNumber: string
  phoneVerifiedAt: string | null
  status: string
  trustLevel: string
  createdAt: string
}

export interface UserRepository {
  findByPhone(phoneNumber: string): Promise<UserRecord | null>
  findById(id: number): Promise<UserRecord | null>
  /** Creates a brand-new member, its default display profile, and grants the `member` role, in one logical unit. */
  createMemberWithProfile(phoneNumber: string, phoneVerifiedAtIso: string): Promise<UserRecord>
  markPhoneVerified(userId: number, verifiedAtIso: string): Promise<void>
  markLastLogin(userId: number, atIso: string): Promise<void>
  /** Moderation penalty (spec §2.5 reports queue: warn_user / suspend_user), spec 5.2.E / 14.3 audit. */
  imposeRestriction(input: { userId: number; type: 'warning' | 'temporary_limit' | 'suspension' | 'ban'; reason?: string; imposedBy: number; endsAt?: string | null }): Promise<void>
  /** In-app notification record (spec 13), used to inform a user of a warning/suspension. */
  notify(input: { userId: number; type: string; payloadJson: string }): Promise<void>
}

/** Generates a friendly default alias, e.g. "کاربر ۴۸۲۱", never the real phone number (spec §5.1 privacy default). */
function generateDefaultAlias(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `کاربر ${n}`
}

export function createUserRepository(db: Database): UserRepository {
  return {
    async findByPhone(phoneNumber: string): Promise<UserRecord | null> {
      const rows = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1)
      return (rows[0] as UserRecord | undefined) ?? null
    },

    async findById(id: number): Promise<UserRecord | null> {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
      return (rows[0] as UserRecord | undefined) ?? null
    },

    async createMemberWithProfile(phoneNumber: string, phoneVerifiedAtIso: string): Promise<UserRecord> {
      const inserted = await db
        .insert(users)
        .values({ phoneNumber, phoneVerifiedAt: phoneVerifiedAtIso })
        .returning()
      const user = inserted[0] as UserRecord

      await db.insert(profiles).values({ userId: user.id, displayName: generateDefaultAlias() })

      const memberRole = await db.select().from(roles).where(eq(roles.key, 'member')).limit(1)
      if (memberRole[0]) {
        await db.insert(modelHasRoles).values({ userId: user.id, roleId: memberRole[0].id })
      }

      return user
    },

    async markPhoneVerified(userId: number, verifiedAtIso: string): Promise<void> {
      await db.update(users).set({ phoneVerifiedAt: verifiedAtIso }).where(eq(users.id, userId))
    },

    async markLastLogin(userId: number, atIso: string): Promise<void> {
      await db.update(users).set({ lastLoginAt: atIso }).where(eq(users.id, userId))
    },

    async imposeRestriction(input) {
      await db.insert(userRestrictions).values({
        userId: input.userId,
        type: input.type,
        reason: input.reason,
        imposedBy: input.imposedBy,
        endsAt: input.endsAt ?? null,
      })
      // A 'suspension'/'ban' also flips the account status so login/session
      // checks (spec 5.2.E) can enforce it without re-querying restrictions.
      if (input.type === 'suspension' || input.type === 'ban') {
        await db.update(users).set({ status: input.type === 'ban' ? 'banned' : 'suspended' }).where(eq(users.id, input.userId))
      }
    },

    async notify(input) {
      await db.insert(notifications).values({
        userId: input.userId,
        type: input.type,
        channel: 'database',
        payloadJson: input.payloadJson,
      })
    },
  }
}
