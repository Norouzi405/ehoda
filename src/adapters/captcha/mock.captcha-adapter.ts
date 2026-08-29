import type { CaptchaAdapter, CaptchaVerifyResult } from './captcha-adapter.interface'

/**
 * Development/sandbox captcha adapter — accepts any non-empty token, and
 * additionally always accepts the literal `'test'` token used by the local
 * dev UI / Vitest tests. Used until TURNSTILE_SECRET_KEY is configured.
 */
export class MockCaptchaAdapter implements CaptchaAdapter {
  async verify(token: string): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, errorCodes: ['missing-input-response'] }
    return { success: true }
  }
}
