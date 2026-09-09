import { Hono } from 'hono'
import { renderer } from './renderer'
import type { Bindings } from './lib/bindings'
import { pdfTestRoute } from './routes/pdf-test'
import { devToolsRoute } from './routes/dev-tools'
import { authRoute } from './routes/auth'
import { contentRoute } from './routes/content'
import { pagesRoute } from './routes/pages'
import { porseshkadehRoute } from './routes/porseshkadeh.api'
import { porseshkadehPagesRoute } from './routes/porseshkadeh.pages'
import { toolsRoute } from './routes/tools.api'
import { filesRoute } from './routes/files'
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
app.route('/api', devToolsRoute) // Diagnostic-only Mock-OTP echo, see routes/dev-tools.ts
app.route('/api', authRoute)
app.route('/api', contentRoute)
app.route('/api', porseshkadehRoute)
app.route('/api', toolsRoute) // Interactive Toolkit House JSON API (spec §11), see routes/tools.api.ts
app.route('/', filesRoute) // Signed R2 download proxy, see routes/files.ts

// --- Server-rendered public pages (D-004) ---
app.route('/', pagesRoute)
app.route('/', porseshkadehPagesRoute)

app.get('/', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))
  const { items } = await service.listPublished({ pageSize: 3 })

  const suggestionPills = [
    { label: 'اولین گوشی فرزند', href: '/porseshkadeh?q=اولین گوشی' },
    { label: 'اختلاف والدین سر تبلت', href: '/porseshkadeh?q=تبلت' },
    { label: 'اینستاگرام نوجوان', href: '/porseshkadeh?q=اینستاگرام' },
  ]

  return c.render(
    <div dir="rtl">
      <SiteHeader />

      {/* ---------------- Hero ---------------- */}
      <section class="hero-gradient hero-dotted border-b border-stone-200/60">
        <div class="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center">
          <span class="inline-flex items-center gap-2 bg-amber-100 text-amber-800 rounded-full px-4 py-1.5 text-xs font-bold mb-6">
            <i class="fas fa-seedling"></i>
            فضایی آرام برای پرسش‌های واقعی خانواده
          </span>
          <h1 class="font-display text-3xl lg:text-4xl font-extrabold text-stone-800 mb-4 leading-tight">
            هر دغدغه‌ای دربارهٔ فرزندتان دارید،
            <br class="hidden md:block" />
            اینجا با آرامش بپرسید.
          </h1>
          <p class="text-base md:text-lg text-stone-500 max-w-2xl mx-auto mb-10">
            مرجع سواد رسانه‌ای برای والدین، معلمان و مربیان — محتوای علمی، پرسش‌کدهٔ مشورتی
            و ابزارهای عملی برای مدیریت آگاهانهٔ رسانه در خانواده.
          </p>

          {/* Floating search box */}
          <form action="/porseshkadeh" method="get" class="max-w-2xl mx-auto mb-6">
            <div class="search-float bg-white rounded-2xl border border-stone-200/70 p-2 flex items-center gap-2">
              <i class="fas fa-magnifying-glass text-stone-400 mx-3"></i>
              <input
                type="text"
                name="q"
                placeholder="مثلاً: فرزندم زمان زیادی پای گوشی است..."
                class="flex-1 bg-transparent border-0 outline-none py-3 text-stone-800 placeholder:text-stone-400"
              />
              <button
                type="submit"
                class="bg-teal-800 hover:bg-teal-900 text-white rounded-xl px-5 py-3 text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <i class="fas fa-search"></i>
                جست‌وجو
              </button>
            </div>
          </form>

          {/* Suggestion pills */}
          <div class="flex flex-wrap justify-center gap-2 mb-4">
            {suggestionPills.map((pill) => (
              <a
                href={pill.href}
                class="suggest-pill bg-white border border-stone-200 text-stone-600 rounded-full px-4 py-1.5 text-sm"
              >
                {pill.label}
              </a>
            ))}
          </div>

          <div class="flex justify-center gap-3 flex-wrap mt-8">
            <a href="/porseshkadeh" class="bg-teal-800 text-white px-6 py-3 rounded-full font-bold hover:bg-teal-900 transition-colors shadow-sm">
              مشاهدهٔ پرسش‌کده
            </a>
            <a href="/login" class="bg-white border border-stone-200 text-stone-700 px-6 py-3 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
              ورود و ثبت پرسش
            </a>
          </div>
        </div>
      </section>

      <main class="max-w-5xl mx-auto px-4 md:px-6">
        {items.length > 0 && (
          <section class="py-16">
            <div class="flex items-center justify-between mb-6">
              <h2 class="font-display text-xl font-extrabold text-stone-800">تازه‌ترین محتوای مرجع</h2>
              <a href="/contents" class="text-teal-800 text-sm font-bold hover:underline flex items-center gap-1">
                مشاهدهٔ همه
                <i class="fas fa-arrow-left text-xs"></i>
              </a>
            </div>
            <div class="grid gap-6 md:grid-cols-3">
              {items.map((item) => (
                <a
                  href={`/contents/${item.slug}`}
                  class="soft-card block bg-white rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md p-6"
                >
                  {item.categoryNameFa && (
                    <span class="inline-block text-xs font-bold text-amber-800 bg-amber-100 rounded-lg px-2.5 py-1 mb-3">
                      {item.categoryNameFa}
                    </span>
                  )}
                  <h3 class="font-extrabold text-stone-800 mb-2">{item.title}</h3>
                  {item.summary && <p class="text-stone-500 text-sm line-clamp-3">{item.summary}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        <section class="pb-16 border-t border-stone-200 pt-10">
          <h2 class="text-lg font-extrabold text-stone-800 mb-2">اثبات فنی PDF فارسی (Gate Check)</h2>
          <p class="text-stone-500 mb-3 text-sm">
            نمونهٔ سند فارسی راست‌چین رندرشده با فونت وزیرمتن از طریق Cloudflare Browser Rendering:
          </p>
          <a href="/api/_gatecheck/pdf-sample" class="text-teal-800 hover:underline text-sm font-bold">
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
