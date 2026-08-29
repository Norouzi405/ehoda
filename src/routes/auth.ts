/**
 * Auth routes (spec §8.1, docs/api.md §Auth). Thin HTTP layer only — all
 * business logic lives in OtpService/AuthService (portability rule 3.1).
 */
import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import { z } from 'zod'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createOtpRepository } from '../repositories/otp.repository'
import { createUserRepository } from '../repositories/user.repository'
import { createSessionRepository } from '../repositories/session.repository'
import { createSettingsRepository } from '../repositories/settings.repository'
import { createOtpService } from '../services/otp.service'
import { createAuthService } from '../services/auth.service'
import { SESSION_COOKIE_NAME } from '../middleware/auth'
import { CURRENT_USER_ID_KEY } from '../middleware/rbac'
import { normalizeIranPhone } from '../lib/phone'

export const authRoute = new Hono<{ Bindings: Bindings }>()

const otpRequestSchema = z.object({
  phoneNumber: z.string().min(8).max(20),
  turnstileToken: z.string().min(1),
})

const otpVerifySchema = z.object({
  requestId: z.string().min(1),
  code: z.string().min(4).max(8),
})

authRoute.post('/auth/otp/request', async (c) => {
  const parsed = otpRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)
  }

  const phoneNumber = normalizeIranPhone(parsed.data.phoneNumber)
  if (!phoneNumber) {
    return c.json({ error: 'invalid_phone_number' }, 400)
  }

  const ctx = buildAppContext(c)

  const captchaResult = await ctx.captcha.verify(parsed.data.turnstileToken, c.req.header('cf-connecting-ip'))
  if (!captchaResult.success) {
    return c.json({ error: 'captcha_failed', errorCodes: captchaResult.errorCodes }, 400)
  }

  const otpService = createOtpService(
    createOtpRepository(ctx.db),
    createSettingsRepository(ctx.db),
    ctx.sms,
  )

  const result = await otpService.requestOtp(phoneNumber, {
    ipAddress: c.req.header('cf-connecting-ip'),
    deviceFingerprint: c.req.header('user-agent'),
  })

  if (!result.ok) {
    const statusByError = { rate_limited: 429, cooldown: 429, sms_failed: 502 } as const
    return c.json({ error: result.error }, statusByError[result.error])
  }

  return c.json({ requestId: result.requestId, cooldownSeconds: result.cooldownSeconds })
})

authRoute.post('/auth/otp/verify', async (c) => {
  const parsed = otpVerifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)
  }

  const ctx = buildAppContext(c)
  const otpService = createOtpService(
    createOtpRepository(ctx.db),
    createSettingsRepository(ctx.db),
    ctx.sms,
  )

  const verifyResult = await otpService.verifyOtp(parsed.data.requestId, parsed.data.code)
  if (!verifyResult.ok) {
    return c.json({ error: verifyResult.error }, 400)
  }

  const authService = createAuthService(createUserRepository(ctx.db), createSessionRepository(ctx.db))
  const { user, isNewUser } = await authService.findOrCreateUserByPhone(verifyResult.phoneNumber)
  const { token, expiresAt } = await authService.issueSession(user.id, {
    userAgent: c.req.header('user-agent'),
    ipAddress: c.req.header('cf-connecting-ip'),
  })

  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAt),
  })

  return c.json({ userId: user.id, isNewUser })
})

authRoute.post('/auth/logout', async (c) => {
  const ctx = buildAppContext(c)
  const authService = createAuthService(createUserRepository(ctx.db), createSessionRepository(ctx.db))
  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (token) await authService.revokeSession(token)
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  return c.json({ success: true })
})

authRoute.get('/auth/me', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const userRepo = createUserRepository(ctx.db)
  const user = await userRepo.findById(userId)
  if (!user) return c.json({ error: 'unauthenticated' }, 401)

  return c.json({ id: user.id, phoneNumber: user.phoneNumber, trustLevel: user.trustLevel, status: user.status })
})
