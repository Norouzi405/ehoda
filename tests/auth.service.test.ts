import { describe, it, expect } from 'vitest'
import { createAuthService } from '../src/services/auth.service'
import type { UserRepository, UserRecord } from '../src/repositories/user.repository'
import type { SessionRepository, SessionRecord, CreateSessionInput } from '../src/repositories/session.repository'

/**
 * Unit tests for AuthService (spec §8.1 session handling). Uses in-memory
 * fake repositories, following the same pattern as authz.service.test.ts.
 */
function createFakeUserRepo(): UserRepository & { users: UserRecord[] } {
  const users: UserRecord[] = []
  let nextId = 1
  return {
    users,
    async findByPhone(phoneNumber) {
      return users.find((u) => u.phoneNumber === phoneNumber) ?? null
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null
    },
    async createMemberWithProfile(phoneNumber, phoneVerifiedAtIso) {
      const user: UserRecord = {
        id: nextId++,
        phoneNumber,
        phoneVerifiedAt: phoneVerifiedAtIso,
        status: 'active',
        trustLevel: 'new',
        createdAt: new Date().toISOString(),
      }
      users.push(user)
      return user
    },
    async markPhoneVerified(userId, verifiedAtIso) {
      const u = users.find((x) => x.id === userId)
      if (u) u.phoneVerifiedAt = verifiedAtIso
    },
    async markLastLogin() {},
  }
}

function createFakeSessionRepo(): SessionRepository & { rows: SessionRecord[] } {
  const rows: SessionRecord[] = []
  let nextId = 1
  return {
    rows,
    async create(input: CreateSessionInput) {
      rows.push({ id: nextId++, userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt })
    },
    async findByTokenHash(tokenHash) {
      return rows.find((r) => r.tokenHash === tokenHash) ?? null
    },
    async touch() {},
    async deleteByTokenHash(tokenHash) {
      const idx = rows.findIndex((r) => r.tokenHash === tokenHash)
      if (idx >= 0) rows.splice(idx, 1)
    },
  }
}

const PHONE = '+989121234567'

describe('AuthService.findOrCreateUserByPhone', () => {
  it('creates a new member on first login (OTP login doubles as signup, spec §8.1)', async () => {
    const userRepo = createFakeUserRepo()
    const auth = createAuthService(userRepo, createFakeSessionRepo())

    const { user, isNewUser } = await auth.findOrCreateUserByPhone(PHONE)
    expect(isNewUser).toBe(true)
    expect(user.phoneNumber).toBe(PHONE)
    expect(userRepo.users.length).toBe(1)
  })

  it('returns the existing user on subsequent logins, never duplicating', async () => {
    const userRepo = createFakeUserRepo()
    const auth = createAuthService(userRepo, createFakeSessionRepo())

    const first = await auth.findOrCreateUserByPhone(PHONE)
    const second = await auth.findOrCreateUserByPhone(PHONE)

    expect(second.isNewUser).toBe(false)
    expect(second.user.id).toBe(first.user.id)
    expect(userRepo.users.length).toBe(1)
  })
})

describe('AuthService session lifecycle', () => {
  it('issues a session and can resolve it back to the same user id', async () => {
    const userRepo = createFakeUserRepo()
    const sessionRepo = createFakeSessionRepo()
    const auth = createAuthService(userRepo, sessionRepo)

    const { user } = await auth.findOrCreateUserByPhone(PHONE)
    const { token } = await auth.issueSession(user.id)

    const resolved = await auth.resolveSession(token)
    expect(resolved).not.toBeNull()
    expect(resolved?.userId).toBe(user.id)
  })

  it('never persists the raw session token, only its hash', async () => {
    const userRepo = createFakeUserRepo()
    const sessionRepo = createFakeSessionRepo()
    const auth = createAuthService(userRepo, sessionRepo)

    const { user } = await auth.findOrCreateUserByPhone(PHONE)
    const { token } = await auth.issueSession(user.id)

    expect(sessionRepo.rows[0].tokenHash).not.toBe(token)
    expect(sessionRepo.rows[0].tokenHash.length).toBe(64) // sha256 hex
  })

  it('rejects an expired session', async () => {
    const userRepo = createFakeUserRepo()
    const sessionRepo = createFakeSessionRepo()
    let now = Date.parse('2026-01-01T00:00:00.000Z')
    const auth = createAuthService(userRepo, sessionRepo, () => now)

    const { user } = await auth.findOrCreateUserByPhone(PHONE)
    const { token } = await auth.issueSession(user.id)

    now += 31 * 24 * 60 * 60 * 1000 // 31 days later, past the 30-day TTL
    const resolved = await auth.resolveSession(token)
    expect(resolved).toBeNull()
  })

  it('revokes a session so it can no longer be resolved (logout)', async () => {
    const userRepo = createFakeUserRepo()
    const sessionRepo = createFakeSessionRepo()
    const auth = createAuthService(userRepo, sessionRepo)

    const { user } = await auth.findOrCreateUserByPhone(PHONE)
    const { token } = await auth.issueSession(user.id)

    await auth.revokeSession(token)
    const resolved = await auth.resolveSession(token)
    expect(resolved).toBeNull()
  })

  it('rejects an unknown/garbage token', async () => {
    const auth = createAuthService(createFakeUserRepo(), createFakeSessionRepo())
    const resolved = await auth.resolveSession('not-a-real-token')
    expect(resolved).toBeNull()
  })
})
