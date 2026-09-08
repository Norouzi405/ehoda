/**
 * Builds a fully self-contained, Persian RTL-ready HTML document for a
 * given PDF template. This HTML is the ONLY thing that ever crosses the
 * PdfAdapter boundary (portability rule 3.6) — the template markup itself
 * has zero Cloudflare-specific code, so it will render identically under
 * Puppeteer/WeasyPrint on a future VPS.
 *
 * Font: Vazirmatn (open-source, OFL-licensed, full Persian glyph coverage
 * incl. correct letter joining) loaded from a CDN inside the rendered
 * page — Cloudflare Browser Rendering executes with outbound network
 * access, so @font-face over HTTPS resolves normally.
 *
 * Font source note: previously pinned to a versioned jsDelivr GitHub-raw
 * path (cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@...), which is fragile —
 * one of its sibling paths (Farsi-Digits/font-face.css, used on the live
 * site) went 404 after an upstream repo restructure. Switched to Google
 * Fonts' gstatic static-file mirror, which is the same font files served
 * from Google's always-on, versionless CDN — consistent with the live
 * site's renderer.tsx fix and safer long-term.
 */

export interface PdfDocumentSection {
  heading?: string
  paragraphs?: string[]
  list?: string[]
}

export interface PdfDocumentInput {
  title: string
  subtitle?: string
  generatedAtFa: string // Jalali-formatted date string, pre-computed by caller
  sections: PdfDocumentSection[]
  footerNote?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderPdfDocumentHtml(doc: PdfDocumentInput): string {
  const sectionsHtml = doc.sections.map((s) => `
    <section class="doc-section">
      ${s.heading ? `<h2>${escapeHtml(s.heading)}</h2>` : ''}
      ${(s.paragraphs ?? []).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
      ${s.list?.length ? `<ul>${s.list.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>` : ''}
    </section>
  `).join('\n')

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Vazirmatn';
    src: url('https://fonts.gstatic.com/s/vazirmatn/v16/Dxxo8j6PP2D_kU2muijlGMWWMmk.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Vazirmatn';
    src: url('https://fonts.gstatic.com/s/vazirmatn/v16/Dxx78j6PP2D_kU2muijPEe1n2vVbfJRklY80CRWT7lDF.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
  }
  @font-face {
    font-family: 'Baloo Bhaijaan 2';
    src: url('https://fonts.gstatic.com/s/baloobhaijaan2/v21/zYXwKUwuEqdVGqM8tPDdAA_Y-_bMKo1EhQd2tWxo8Tx2TZP6JYtZfQ.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
  }
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Vazirmatn', Tahoma, sans-serif;
    direction: rtl;
    text-align: right;
    color: #1f2937;
    line-height: 1.9;
    font-size: 13px;
  }
  header.doc-header {
    border-bottom: 3px solid #0f766e;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  header.doc-header h1 { font-family: 'Baloo Bhaijaan 2', 'Vazirmatn', Tahoma, sans-serif; font-size: 22px; font-weight: 700; margin: 0 0 4px; color: #0f766e; }
  header.doc-header .subtitle { font-size: 13px; color: #4b5563; }
  header.doc-header .meta { font-size: 11px; color: #9ca3af; margin-top: 6px; }
  .doc-section { margin-bottom: 18px; page-break-inside: avoid; }
  .doc-section h2 { font-size: 16px; font-weight: 700; color: #0f766e; border-right: 4px solid #0f766e; padding-right: 8px; margin: 0 0 8px; }
  .doc-section p { margin: 0 0 8px; }
  .doc-section ul { margin: 0; padding-right: 20px; }
  .doc-section li { margin-bottom: 6px; }
  footer.doc-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(doc.title)}</h1>
    ${doc.subtitle ? `<div class="subtitle">${escapeHtml(doc.subtitle)}</div>` : ''}
    <div class="meta">تاریخ تولید سند: ${escapeHtml(doc.generatedAtFa)} — پلتفرم «خانواده و رسانه»</div>
  </header>
  ${sectionsHtml}
  <footer class="doc-footer">
    ${doc.footerNote ? escapeHtml(doc.footerNote) : 'این سند صرفاً جهت راهنمایی خانواده تهیه شده و جای مشاوره تخصصی را نمی‌گیرد.'}
  </footer>
</body>
</html>`
}
