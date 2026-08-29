/**
 * Service layer (portability rule 3.1): pure business logic for OTP
 * request/verify, zero framework/Cloudflare imports. Depends only on
 * repository/adapter interfaces injected by the caller (see routes/auth.ts).
 *
 * Rate limit default: 3 requests / 10 minutes per phone number (D-008,
 * admin-editable via settings.rate_limits.otp_attempts_per_10min).
 */
import type { OtpRepository } from '../repositories/otp.repository'
import type { SettingsRepository } from '../repositories/settings.repository'
import type { SmsAdapter } from '../adapters/sms/sms-adapter.interface'
import { sha256Hex, randomNumericCode, randomRequestId, timingSafeEqual } from '../lib/crypto'

export interface RateLimitDefaults {
  otp_attempts_per_10min: number
  questions_per_day: number
  responses_per_day: number
}

const DEFAULT_RATE_LIMITS: RateLimitDefaults = {
  otp_attempts_per_10min: 3,
  questions_per_day: 5,
  responses_per_day: 20,
}

const OTP_CODE_TTL_SECONDS = 120
const OTP_MAX_VERIFY_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_SECONDS = 60

export type OtpRequestResult =
  | { ok: true; requestId: string; cooldownSeconds: number }
  | { ok: false; error: 'rate_limited' | 'cooldown' | 'sms_failed' }

export type OtpVerifyResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: 'not_found' | 'expired' | 'already_consumed' | 'too_many_attempts' | 'invalid_code' }

export interface OtpService {
  requestOtp(phoneNumber: string, opts?: { ipAddress?: string; deviceFingerprint?: string }): Promise<OtpRequestResult>
  verifyOtp(requestId: string, code: string): Promise<OtpVerifyResult>
}

function minutesAgoIso(minutes: number, nowMs: number): string {
  return new Date(nowMs - minutes * 60_000).toISOString()
}

export function createOtpService(
  otpRepo: OtpRepository,
  settingsRepo: SettingsRepository,
  sms: SmsAdapter,
  clock: () => number = () => Date.now(),
): OtpService {
  return {
    async requestOtp(phoneNumber, opts) {
      const now = clock()
      const rateLimits = await settingsRepo.getJson<RateLimitDefaults>('rate_limits', DEFAULT_RATE_LIMITS)

      const latest = await otpRepo.findLatestByPhone(phoneNumber)
      if (latest) {
        const elapsedSeconds = (now - Date.parse(latest.createdAt)) / 1000
        if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
          return { ok: false, error: 'cooldown' }
        }
      }

      const windowStart = minutesAgoIso(10, now)
      const recentCount = await otpRepo.countRecentByPhone(phoneNumber, windowStart)
      if (recentCount >= rateLimits.otp_attempts_per_10min) {
        return { ok: false, error: 'rate_limited' }
      }

      const code = randomNumericCode(6)
      const codeHash = await sha256Hex(code)
      const requestId = randomRequestId()
      const expiresAt = new Date(now + OTP_CODE_TTL_SECONDS * 1000).toISOString()

      await otpRepo.create({
        requestId,
        phoneNumber,
        codeHash,
        purpose: 'login',
        ipAddress: opts?.ipAddress,
        deviceFingerprint: opts?.deviceFingerprint,
        maxAttempts: OTP_MAX_VERIFY_ATTEMPTS,
        expiresAt,
      })

      const sendResult = await sms.sendOtp(phoneNumber, code)
      if (!sendResult.success) {
        return { ok: false, error: 'sms_failed' }
      }

      return { ok: true, requestId, cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS }
    },

    async verifyOtp(requestId, code) {
      const record = await otpRepo.findByRequestId(requestId)
      if (!record) return { ok: false, error: 'not_found' }
      if (record.consumedAt) return { ok: false, error: 'already_consumed' }

      const now = clock()
      if (Date.parse(record.expiresAt) < now) return { ok: false, error: 'expired' }
      if (record.attempts >= record.maxAttempts) return { ok: false, error: 'too_many_attempts' }

      const candidateHash = await sha256Hex(code)
      if (!timingSafeEqual(candidateHash, record.codeHash)) {
        await otpRepo.incrementAttempts(record.id)
        return { ok: false, error: 'invalid_code' }
      }

      await otpRepo.markConsumed(record.id, new Date(now).toISOString())
      return { ok: true, phoneNumber: record.phoneNumber }
    },
  }
}
