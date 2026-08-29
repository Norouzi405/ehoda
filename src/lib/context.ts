/**
 * Dependency-injection container built once per-request from the Hono
 * context. All routes pull their services from here instead of importing
 * concrete adapters directly — this is what lets services stay portable
 * (rule 3.1). On VPS migration, only this file (and bindings.ts,
 * db/client.ts) need to change.
 */
import type { Context } from 'hono'
import type { Bindings } from './bindings'
import { createDb, type Database } from '../db/client'
import { createSmsAdapter } from '../adapters/sms'
import { createCaptchaAdapter } from '../adapters/captcha'
import { R2StorageService } from '../adapters/storage/r2.storage-service'
import { BrowserRenderingPdfAdapter } from '../adapters/pdf/browser-rendering.pdf-adapter'
import type { StorageService } from '../adapters/storage/storage-service.interface'
import type { PdfAdapter } from '../adapters/pdf/pdf-adapter.interface'
import type { SmsAdapter } from '../adapters/sms/sms-adapter.interface'
import type { CaptchaAdapter } from '../adapters/captcha/captcha-adapter.interface'

export interface AppContext {
  db: Database
  sms: SmsAdapter
  captcha: CaptchaAdapter
  storage: StorageService
  pdf: PdfAdapter
  env: Bindings
}

export function buildAppContext(c: Context<{ Bindings: Bindings }>): AppContext {
  const env = c.env
  const db = createDb(env.DB)
  const sms = createSmsAdapter(env)
  const captcha = createCaptchaAdapter(env)
  const storage = new R2StorageService(env.R2, env.FILE_SIGN_SECRET ?? 'dev-sign-secret-change-me')
  const pdf = new BrowserRenderingPdfAdapter(env.CLOUDFLARE_ACCOUNT_ID ?? '', env.CLOUDFLARE_API_TOKEN ?? '')
  return { db, sms, captcha, storage, pdf, env }
}
