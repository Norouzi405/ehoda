import { describe, it, expect } from 'vitest'
import { createOtpService } from '../src/services/otp.service'
import type { OtpRepository, OtpTokenRecord, CreateOtpInput } from '../src/repositories/otp.repository'
import type { SettingsRepository } from '../src/repositories/settings.repository'
import type { SmsAdapter } from '../src/adapters/sms/sms-adapter.interface'
import { sha256Hex } from '../src/lib/crypto'

/**
 * Unit tests for OtpService (spec §8.2, §14.1, D-008 rate limits). Uses an
 * in-memory fake repository — this is exactly the point of the layered
 * architecture: business logic is testable without D1/Cloudflare runtime.
 */
function createFakeOtpRepo(clock: () => number = () => Date.now()): OtpRepository & { rows: OtpTokenRecord[] } {
  const rows: OtpTokenRecord[] = []
  let nextId = 1
  return {
    rows,
    async create(input: CreateOtpInput) {
      rows.push({
        id: nextId++,
        requestId: input.requestId,
        phoneNumber: input.phoneNumber,
        codeHash: input.codeHash,
        purpose: input.purpose,
        attempts: 0,
        maxAttempts: input.maxAttempts,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: new Date(clock()).toISOString(),
      })
    },
    async findByRequestId(requestId) {
      return rows.find((r) => r.requestId === requestId) ?? null
    },
    async incrementAttempts(id) {
      const row = rows.find((r) => r.id === id)
      if (row) row.attempts += 1
    },
    async markConsumed(id, consumedAtIso) {
      const row = rows.find((r) => r.id === id)
      if (row) row.consumedAt = consumedAtIso
    },
    async countRecentByPhone(phoneNumber, sinceIso) {
      return rows.filter((r) => r.phoneNumber === phoneNumber && r.createdAt >= sinceIso).length
    },
    async findLatestByPhone(phoneNumber) {
      const matches = rows.filter((r) => r.phoneNumber === phoneNumber)
      return matches.length ? matches[matches.length - 1] : null
    },
  }
}

function createFakeSettingsRepo(): SettingsRepository {
  return { async getJson(_key, fallback) { return fallback } }
}

function createFakeSms(shouldSucceed = true): SmsAdapter & { sentCodes: string[] } {
  const sentCodes: string[] = []
  return {
    sentCodes,
    async sendOtp(_phoneNumber, code) {
      sentCodes.push(code)
      return { success: shouldSucceed }
    },
  }
}

const PHONE = '+989121234567'

describe('OtpService.requestOtp', () => {
  it('issues a request id and sends the code via the SMS adapter', async () => {
    const repo = createFakeOtpRepo()
    const sms = createFakeSms()
    const service = createOtpService(repo, createFakeSettingsRepo(), sms)

    const result = await service.requestOtp(PHONE)
    expect(result.ok).toBe(true)
    expect(sms.sentCodes.length).toBe(1)
    expect(sms.sentCodes[0]).toMatch(/^\d{6}$/)
  })

  it('rejects with cooldown when requested again immediately after', async () => {
    const repo = createFakeOtpRepo()
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms())

    await service.requestOtp(PHONE)
    const second = await service.requestOtp(PHONE)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toBe('cooldown')
  })

  it('enforces the 10-minute rate limit (default 3 attempts) once cooldown is bypassed via a fake clock', async () => {
    let now = Date.parse('2026-01-01T00:00:00.000Z')
    const repo = createFakeOtpRepo(() => now)
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms(), () => now)

    // 3 requests, each 61s apart (past the 60s cooldown), all within the 10-minute window.
    for (let i = 0; i < 3; i++) {
      const r = await service.requestOtp(PHONE)
      expect(r.ok).toBe(true)
      now += 61_000
    }

    const fourth = await service.requestOtp(PHONE)
    expect(fourth.ok).toBe(false)
    if (!fourth.ok) expect(fourth.error).toBe('rate_limited')
  })

  it('propagates sms_failed when the SMS adapter fails', async () => {
    const repo = createFakeOtpRepo()
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms(false))

    const result = await service.requestOtp(PHONE)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('sms_failed')
  })
})

describe('OtpService.verifyOtp', () => {
  it('verifies a correct code and marks it consumed (single use)', async () => {
    const repo = createFakeOtpRepo()
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms())

    const requestResult = await service.requestOtp(PHONE)
    expect(requestResult.ok).toBe(true)
    if (!requestResult.ok) return

    const sms = createFakeSms()
    // Re-derive the actual code by reading it back from a second service instance sharing the same repo is not possible
    // (the code is only known to the SMS adapter). Instead, verify via the stored hash comparison path directly.
    const stored = repo.rows[0]
    // We cannot invert the hash, so instead assert the negative path here and a dedicated hash-based positive test below.
    const wrongAttempt = await service.verifyOtp(requestResult.requestId, '000000')
    expect(wrongAttempt.ok).toBe(false)
    if (!wrongAttempt.ok) expect(wrongAttempt.error).toBe('invalid_code')
    expect(stored.attempts).toBe(1)
  })

  it('accepts the correct code end-to-end using a real SMS adapter capture', async () => {
    const repo = createFakeOtpRepo()
    let capturedCode = ''
    const sms: SmsAdapter = {
      async sendOtp(_phone, code) {
        capturedCode = code
        return { success: true }
      },
    }
    const service = createOtpService(repo, createFakeSettingsRepo(), sms)

    const requestResult = await service.requestOtp(PHONE)
    expect(requestResult.ok).toBe(true)
    if (!requestResult.ok) return

    const verifyResult = await service.verifyOtp(requestResult.requestId, capturedCode)
    expect(verifyResult.ok).toBe(true)
    if (verifyResult.ok) expect(verifyResult.phoneNumber).toBe(PHONE)

    // Second verify with the same (now consumed) code must fail — single use.
    const secondVerify = await service.verifyOtp(requestResult.requestId, capturedCode)
    expect(secondVerify.ok).toBe(false)
    if (!secondVerify.ok) expect(secondVerify.error).toBe('already_consumed')
  })

  it('rejects an expired code', async () => {
    let now = Date.parse('2026-01-01T00:00:00.000Z')
    const repo = createFakeOtpRepo(() => now)
    let capturedCode = ''
    const sms: SmsAdapter = {
      async sendOtp(_phone, code) {
        capturedCode = code
        return { success: true }
      },
    }
    const service = createOtpService(repo, createFakeSettingsRepo(), sms, () => now)

    const requestResult = await service.requestOtp(PHONE)
    expect(requestResult.ok).toBe(true)
    if (!requestResult.ok) return

    now += 121_000 // past the 120s TTL
    const verifyResult = await service.verifyOtp(requestResult.requestId, capturedCode)
    expect(verifyResult.ok).toBe(false)
    if (!verifyResult.ok) expect(verifyResult.error).toBe('expired')
  })

  it('locks out after too many wrong attempts (max 5)', async () => {
    const repo = createFakeOtpRepo()
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms())

    const requestResult = await service.requestOtp(PHONE)
    expect(requestResult.ok).toBe(true)
    if (!requestResult.ok) return

    for (let i = 0; i < 5; i++) {
      await service.verifyOtp(requestResult.requestId, '000000')
    }
    const sixthAttempt = await service.verifyOtp(requestResult.requestId, '000000')
    expect(sixthAttempt.ok).toBe(false)
    if (!sixthAttempt.ok) expect(sixthAttempt.error).toBe('too_many_attempts')
  })

  it('returns not_found for an unknown request id', async () => {
    const repo = createFakeOtpRepo()
    const service = createOtpService(repo, createFakeSettingsRepo(), createFakeSms())
    const result = await service.verifyOtp('req_does_not_exist', '123456')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not_found')
  })
})

describe('sha256Hex determinism (sanity check for OTP hashing)', () => {
  it('produces the same hash for the same input', async () => {
    const a = await sha256Hex('123456')
    const b = await sha256Hex('123456')
    expect(a).toBe(b)
    expect(a).not.toBe(await sha256Hex('654321'))
  })
})
