import type { SmsAdapter } from './sms-adapter.interface'
import { KavenegarSmsAdapter } from './kavenegar.sms-adapter'
import { MockSmsAdapter } from './mock.sms-adapter'
import type { Bindings } from '../../lib/bindings'

/** Factory: picks the adapter implementation based on runtime config (SMS_PROVIDER secret/var). */
export function createSmsAdapter(env: Bindings): SmsAdapter {
  if (env.SMS_PROVIDER === 'kavenegar' && env.KAVENEGAR_API_KEY) {
    return new KavenegarSmsAdapter(env.KAVENEGAR_API_KEY)
  }
  return new MockSmsAdapter()
}
