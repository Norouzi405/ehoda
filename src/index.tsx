import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings } from './lib/bindings'
import { pdfTestRoute } from './routes/pdf-test'

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)

// Gate-check technical proofs (see docs/decisions.md §Gate Check)
app.route('/api', pdfTestRoute)

app.get('/', (c) => {
  return c.render(
    <div id="gatecheck-home" class="min-h-screen bg-gray-50 p-6 md:p-10" dir="rtl">
      <main class="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 md:p-10 space-y-6">
        <header>
          <h1 class="text-2xl font-bold text-teal-700">خانواده و رسانه — اسکلت فاز صفر (Gate Check)</h1>
          <p class="text-gray-600 mt-2">
            این نسخه، اسکلت اولیهٔ معماری لایه‌ای پروژه (Routes → Services → Repositories → Adapters) و اثبات فنی
            تولید PDF فارسی از طریق Cloudflare Browser Rendering است.
          </p>
        </header>
        <section class="border-t pt-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-2">اثبات فنی PDF فارسی</h2>
          <p class="text-gray-600 mb-3">
            برای مشاهدهٔ نمونهٔ سند فارسی راست‌چین رندرشده با فونت وزیرمتن:
          </p>
          <a
            href="/api/_gatecheck/pdf-sample"
            class="inline-block bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-teal-800"
          >
            دانلود نمونهٔ PDF
          </a>
        </section>
      </main>
    </div>,
  )
})

export default app
