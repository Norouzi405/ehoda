/**
 * PdfAdapter contract (portability rule 3.6). The calling code always
 * passes a fully-rendered, self-contained, RTL-ready HTML string (built by
 * a Service using a template — see src/services/pdf-template.service.ts)
 * and gets back raw PDF bytes. Whether that HTML is rendered by Cloudflare
 * Browser Rendering, a local Puppeteer/Chromium on a VPS, or WeasyPrint,
 * is entirely hidden behind this interface (spec 3.6 / migration-guide).
 */
export interface PdfAdapter {
  renderHtmlToPdf(html: string): Promise<ArrayBuffer>
}
