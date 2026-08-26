import type { SmsAdapter, SmsSendResult } from './sms-adapter.interface'

/**
 * Kavenegar REST API adapter (client decision, row 2).
 * https://kavenegar.com/rest.html — uses the "Verify Lookup" endpoint so
 * the OTP code is injected into a pre-approved SMS template server-side
 * (no need to build the message text ourselves).
 */
export class KavenegarSmsAdapter implements SmsAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly template: string = 'verify',
  ) {}

  async sendOtp(phoneNumber: string, code: string): Promise<SmsSendResult> {
    const url = `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json`
    const params = new URLSearchParams({
      receptor: phoneNumber,
      token: code,
      template: this.template,
    })
    try {
      const res = await fetch(`${url}?${params.toString()}`, { method: 'GET' })
      const json = await res.json<any>()
      if (res.ok && json?.return?.status === 200) {
        return { success: true, providerMessageId: String(json?.entries?.[0]?.messageid ?? '') }
      }
      return { success: false, errorMessage: json?.return?.message ?? `HTTP ${res.status}` }
    } catch (err) {
      return { success: false, errorMessage: err instanceof Error ? err.message : 'unknown_error' }
    }
  }
}
