import type { PdfAdapter } from './pdf-adapter.interface'

/**
 * Cloudflare Browser Rendering PDF adapter.
 *
 * Uses the account-level REST API
 * (`POST /accounts/{account_id}/browser-rendering/pdf`) rather than a
 * Workers Binding, on purpose:
 *   1. It works identically from Cloudflare Pages Functions and from a
 *      plain Worker, without special wrangler.jsonc binding wiring.
 *   2. It is a plain HTTPS call — trivial to keep working, or to swap for
 *      a local Puppeteer/Chromium call with the exact same signature, when
 *      this project migrates to a VPS (portability rule 3.6 / see
 *      docs/migration-guide-to-vps.md).
 *
 * Auth: `CLOUDFLARE_API_TOKEN` must be an API token with the
 * "Browser Rendering: Edit" permission on the target account, set via
 * `wrangler secret put CLOUDFLARE_API_TOKEN` (see docs/setup.md).
 */
export class BrowserRenderingPdfAdapter implements PdfAdapter {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
  ) {}

  async renderHtmlToPdf(html: string): Promise<ArrayBuffer> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/pdf`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html,
        // Ensure background colors/fonts render exactly as authored.
        pdfOptions: {
          printBackground: true,
          preferCSSPageSize: true,
        },
        gotoOptions: {
          waitUntil: 'networkidle0',
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`browser_rendering_failed: HTTP ${res.status} ${text.slice(0, 500)}`)
    }
    return await res.arrayBuffer()
  }
}
