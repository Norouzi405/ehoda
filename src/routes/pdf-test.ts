/**
 * Gate-check technical proof route (client requirement, Gate Check §5):
 * renders a real Persian/RTL HTML document through Cloudflare Browser
 * Rendering and returns the resulting PDF bytes, so the client can verify
 * correct Persian glyph joining/bidi rendering before full development
 * proceeds.
 *
 * GET /api/_gatecheck/pdf-sample -> downloads a sample PDF file.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { renderPdfDocumentHtml } from '../services/pdf-template.service'

export const pdfTestRoute = new Hono<{ Bindings: Bindings }>()

pdfTestRoute.get('/_gatecheck/pdf-sample', async (c) => {
  const ctx = buildAppContext(c)

  const html = renderPdfDocumentHtml({
    title: 'قرارداد رسانه‌ای خانواده',
    subtitle: 'نمونهٔ اثبات فنی تولید PDF فارسی — پلتفرم «خانواده و رسانه»',
    generatedAtFa: '۶ شهریور ۱۴۰۵',
    sections: [
      {
        heading: 'تعهدهای والدین',
        paragraphs: [
          'ما به عنوان والدین متعهد می‌شویم زمان استفاده از گوشی، تبلت و تلویزیون را با آرامش و بدون قضاوت با فرزندمان گفت‌وگو کنیم.',
        ],
        list: [
          'در زمان غذا، گوشی و تبلت کنار گذاشته می‌شود.',
          'یک ساعت پیش از خواب، صفحه‌نمایش خاموش است.',
          'در سفرها، حداقل یک بازهٔ کامل بدون صفحه در نظر گرفته می‌شود.',
        ],
      },
      {
        heading: 'تعهدهای فرزند',
        paragraphs: ['فرزند خانواده متعهد می‌شود در صورت برخورد با محتوای نامناسب یا موقعیت ناآشنا، موضوع را با والدین در میان بگذارد.'],
        list: ['رعایت زمان تعیین‌شده برای بازی‌های دیجیتال.', 'اطلاع‌رسانی در صورت درخواست دوستی از افراد ناشناس در شبکه‌های اجتماعی.'],
      },
      {
        heading: 'زمان بازبینی توافق',
        paragraphs: ['این توافق هر سه ماه یک‌بار، با حضور همهٔ اعضای خانواده، بازبینی و در صورت نیاز به‌روزرسانی می‌شود.'],
      },
    ],
  })

  try {
    const pdfBytes = await ctx.pdf.renderHtmlToPdf(html)
    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="namoone-gharardad-resaneei.pdf"',
      },
    })
  } catch (err) {
    return c.json(
      {
        error: 'pdf_generation_failed',
        message: err instanceof Error ? err.message : 'unknown_error',
        hint: 'Ensure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Browser Rendering: Edit) secrets are configured.',
      },
      502,
    )
  }
})
