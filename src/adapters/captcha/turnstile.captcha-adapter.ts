import type { CaptchaAdapter, CaptchaVerifyResult } from './captcha-adapter.interface'

/**
 * Cloudflare Turnstile adapter (client decision D-009).
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export class TurnstileCaptchaAdapter implements CaptchaAdapter {
  constructor(private readonly secretKey: string) {}

  async verify(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    try {
      const body = new URLSearchParams({ secret: this.secretKey, response: token })
      if (remoteIp) body.set('remoteip', remoteIp)

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      const json = await res.json<{ success: boolean; 'error-codes'?: string[] }>()
      return { success: !!json.success, errorCodes: json['error-codes'] }
    } catch (err) {
      return { success: false, errorCodes: [err instanceof Error ? err.message : 'unknown_error'] }
    }
  }
}
