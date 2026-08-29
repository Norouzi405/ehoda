/**
 * Cloudflare Worker bindings type. This is the ONLY place in the codebase
 * where Cloudflare-specific binding types are declared. Everything below
 * this layer (services, repositories) works against plain TypeScript
 * interfaces defined in src/adapters/*/*.interface.ts, never against these
 * types directly (portability rule 3.1 / 3.6).
 */
export type Bindings = {
  DB: D1Database
  R2: R2Bucket
  /** Cloudflare Browser Rendering binding (Workers Binding API), used only
   *  inside src/adapters/pdf/browser-rendering.pdf-adapter.ts. */
  BROWSER?: Fetcher

  // --- secrets (wrangler secret put ...) ---
  KAVENEGAR_API_KEY?: string
  SMS_PROVIDER?: string // 'kavenegar' | 'mock'
  CLOUDFLARE_ACCOUNT_ID?: string
  /** API token with "Browser Rendering: Edit" permission, used by BrowserRenderingPdfAdapter. */
  CLOUDFLARE_API_TOKEN?: string
  TURNSTILE_SECRET_KEY?: string
  /** Public Turnstile site key, safe to expose to the browser (unlike TURNSTILE_SECRET_KEY). */
  TURNSTILE_SITE_KEY?: string
  /** Secret used to sign time-limited R2 file download URLs (see R2StorageService). */
  FILE_SIGN_SECRET?: string
}
