/**
 * CaptchaAdapter contract (portability rule 3.6, client decision D-009:
 * Cloudflare Turnstile on OTP/question-submit/report forms). On VPS
 * migration, implement an hCaptcha/reCAPTCHA adapter against this same
 * interface — no caller changes required.
 */
export interface CaptchaVerifyResult {
  success: boolean
  errorCodes?: string[]
}

export interface CaptchaAdapter {
  /**
   * Verifies a client-submitted captcha token.
   * @param token   The token collected from the widget on the client.
   * @param remoteIp Optional visitor IP, improves provider-side fraud scoring.
   */
  verify(token: string, remoteIp?: string): Promise<CaptchaVerifyResult>
}
