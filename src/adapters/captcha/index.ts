import type { CaptchaAdapter } from './captcha-adapter.interface'
import { TurnstileCaptchaAdapter } from './turnstile.captcha-adapter'
import { MockCaptchaAdapter } from './mock.captcha-adapter'
import type { Bindings } from '../../lib/bindings'

/** Factory: picks the adapter implementation based on runtime config. */
export function createCaptchaAdapter(env: Bindings): CaptchaAdapter {
  if (env.TURNSTILE_SECRET_KEY) {
    return new TurnstileCaptchaAdapter(env.TURNSTILE_SECRET_KEY)
  }
  return new MockCaptchaAdapter()
}
