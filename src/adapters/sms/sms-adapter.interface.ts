/**
 * SmsAdapter contract (portability rule 3.6). Any provider (Kavenegar,
 * Melipayamak, Twilio, a local SMPP gateway on a VPS...) implements this
 * interface. Services depend ONLY on this interface, never on a concrete
 * provider class.
 */
export interface SmsSendResult {
  success: boolean
  providerMessageId?: string
  errorMessage?: string
}

export interface SmsAdapter {
  /** Send a short OTP/transactional message. Must NOT include sensitive data beyond the code itself (spec 13.2). */
  sendOtp(phoneNumber: string, code: string): Promise<SmsSendResult>
}
