import type { SmsAdapter, SmsSendResult } from './sms-adapter.interface'

/**
 * Development/sandbox SMS adapter — logs the OTP instead of sending a real
 * SMS. Used until a real Kavenegar API key secret is configured
 * (client decision row 2: "توسعه اولیه با Mock/Sandbox").
 *
 * DIAGNOSTIC-ONLY in-memory echo (Phase 2 addition): while running in Mock
 * mode, the last code sent per phone number is also kept in a module-level
 * map so the `/api/_gatecheck/last-otp/:phone` diagnostic route (see
 * `src/routes/dev-tools.ts`) can hand it back to a client tester who has no
 * real SMS inbox to check on the sandbox preview URL. This NEVER runs when
 * a real provider (Kavenegar) is configured — see `adapters/sms/index.ts`
 * factory — so no OTP code can ever leak this way in production.
 */
const lastOtpByPhone = new Map<string, string>()

export function getLastMockOtp(phoneNumber: string): string | undefined {
  return lastOtpByPhone.get(phoneNumber)
}

export class MockSmsAdapter implements SmsAdapter {
  async sendOtp(phoneNumber: string, code: string): Promise<SmsSendResult> {
    // eslint-disable-next-line no-console
    console.log(`[MockSmsAdapter] OTP for ${phoneNumber}: ${code}`)
    lastOtpByPhone.set(phoneNumber, code)
    return { success: true, providerMessageId: 'mock-' + Date.now() }
  }
}
