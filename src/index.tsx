import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings } from './lib/bindings'
import { pdfTestRoute } from './routes/pdf-test'
import { authRoute } from './routes/auth'
import { contentRoute } from './routes/content'
import { pagesRoute } from './routes/pages'
import { porseshkadehRoute } from './routes/porseshkadeh.api'
import { porseshkadehPagesRoute } from './routes/porseshkadeh.pages'
import { attachCurrentUser } from './middleware/auth'
import { buildAppContext } from './lib/context'
import { createContentRepository } from './repositories/content.repository'
import { createContentService } from './services/content.service'
import { SiteHeader, SiteFooter } from './components/layout'

const app = new Hono<{ Bindings: Bindings }>()

app.use(renderer)
app.use('*', attachCurrentUser)

// --- JSON API ---
app.route('/api', pdfTestRoute) // Gate-check technical proof (see docs/decisions.md §Gate Check)
app.route('/api', authRoute)
app.route('/api', contentRoute)
app.route('/api', porseshkadehRoute)

// --- Server-rendered public pages (D-004) ---
app.route('/', pagesRoute)
app.route('/', porseshkadehPagesRoute)

app.get('/', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))
  const { items } = await service.listPublished({ pageSize: 3 })

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6">
        <section class="py-16 md:py-24 text-center">
          <h1 class="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            خانواده و رسانه
          </h1>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            مرجع سواد رسانه‌ای برای والدین، معلمان و مربیان — محتوای علمی، پرسش‌کدهٔ مشورتی
            و ابزارهای عملی برای مدیریت آگاهانهٔ رسانه در خانواده.
          </p>
          <div class="flex justify-center gap-3 flex-wrap">
            <a href="/contents" class="bg-teal-700 text-white px-6 py-3 rounded-lg hover:bg-teal-800">
              مشاهدهٔ محتوای مرجع
            </a>
            <a href="/login" class="bg-white border border-gray-300 text-gray-800 px-6 py-3 rounded-lg hover:border-teal-600">
              ورود و ثبت پرسش
            </a>
          </div>
        </section>

        {items.length > 0 && (
          <section class="pb-16">
            <h2 class="text-xl font-bold text-gray-900 mb-6">تازه‌ترین محتوای مرجع</h2>
            <div class="grid gap-6 md:grid-cols-3">
              {items.map((item) => (
                <a href={`/contents/${item.slug}`} class="block bg-white border rounded-2xl p-6 hover:shadow-md transition-shadow">
                  {item.categoryNameFa && (
                    <span class="inline-block text-xs text-teal-700 bg-teal-50 rounded-full px-2 py-1 mb-3">
                      {item.categoryNameFa}
                    </span>
                  )}
                  <h3 class="font-bold text-gray-900 mb-2">{item.title}</h3>
                  {item.summary && <p class="text-gray-600 text-sm line-clamp-3">{item.summary}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        <section class="pb-16 border-t pt-10">
          <h2 class="text-xl font-bold text-gray-900 mb-2">اثبات فنی PDF فارسی (Gate Check)</h2>
          <p class="text-gray-600 mb-3 text-sm">
            نمونهٔ سند فارسی راست‌چین رندرشده با فونت وزیرمتن از طریق Cloudflare Browser Rendering:
          </p>
          <a href="/api/_gatecheck/pdf-sample" class="text-teal-700 hover:underline text-sm">
            دانلود نمونهٔ PDF ←
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>,
    { title: 'صفحهٔ اصلی' },
  )
})

export default app
