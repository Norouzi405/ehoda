import type { SmsAdapter, SmsSendResult } from './sms-adapter.interface'

/**
 * Development/sandbox SMS adapter — logs the OTP instead of sending a real
 * SMS. Used until a real Kavenegar API key secret is configured
 * (client decision row 2: "توسعه اولیه با Mock/Sandbox").
 */
export class MockSmsAdapter implements SmsAdapter {
  async sendOtp(phoneNumber: string, code: string): Promise<SmsSendResult> {
    // eslint-disable-next-line no-console
    console.log(`[MockSmsAdapter] OTP for ${phoneNumber}: ${code}`)
    return { success: true, providerMessageId: 'mock-' + Date.now() }
  }
}
