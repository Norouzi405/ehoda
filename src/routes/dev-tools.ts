/**
 * Diagnostic-only route (Phase 2 client sign-off session), same spirit as
 * `_gatecheck/pdf-sample` in `routes/pdf-test.ts`: gives the client a way
 * to complete a REAL OTP login on the sandbox preview URL without a live
 * Kavenegar SMS inbox, using the same test phone numbers seeded into
 * `seeders/seed.sql`.
 *
 * SAFETY: only ever returns a value when the runtime is using
 * `MockSmsAdapter` (i.e. `SMS_PROVIDER !== 'kavenegar'` or the Kavenegar API
 * key secret is unset) — see `adapters/sms/index.ts`. The moment a real
 * Kavenegar key is configured for production, this route always responds
 * 404, so no OTP code can ever leak through it in a real deployment.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { getLastMockOtp } from '../adapters/sms/mock.sms-adapter'
import { normalizeIranPhone } from '../lib/phone'

export const devToolsRoute = new Hono<{ Bindings: Bindings }>()

devToolsRoute.get('/_gatecheck/last-otp/:phone', async (c) => {
  const isMockMode = !(c.env.SMS_PROVIDER === 'kavenegar' && c.env.KAVENEGAR_API_KEY)
  if (!isMockMode) {
    return c.json({ error: 'not_found' }, 404)
  }

  const phoneNumber = normalizeIranPhone(c.req.param('phone'))
  if (!phoneNumber) {
    return c.json({ error: 'invalid_phone_number' }, 400)
  }

  const code = getLastMockOtp(phoneNumber)
  if (!code) {
    return c.json({ error: 'not_found', message: 'هنوز کد OTP‌ای برای این شماره درخواست نشده است.' }, 404)
  }

  return c.json({ phoneNumber, code, note: 'این مسیر فقط در حالت Mock SMS فعال است و در استقرار نهایی با کاوه‌نگار واقعی، همیشه ۴۰۴ برمی‌گرداند.' })
})
