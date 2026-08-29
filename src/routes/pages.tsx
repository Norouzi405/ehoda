/**
 * Server-rendered public pages (D-004: Hono JSX SSR, no SPA). These are the
 * human-facing counterparts of src/routes/content.ts and src/routes/auth.ts
 * — they call the exact same Service layer, never duplicate business logic.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createContentRepository } from '../repositories/content.repository'
import { createContentService } from '../services/content.service'
import { SiteHeader, SiteFooter } from '../components/layout'

export const pagesRoute = new Hono<{ Bindings: Bindings }>()

pagesRoute.get('/contents', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))
  const categorySlug = c.req.query('category') || undefined
  const page = c.req.query('page') ? Number(c.req.query('page')) : 1

  const [{ items, total, pageSize }, categories] = await Promise.all([
    service.listPublished({ categorySlug, page }),
    service.listCategories(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">محتوای مرجع</h1>
        <p class="text-gray-600 mb-8">مقالات و راهنماهای مسئله‌محور برای والدین، مربیان و معلمان.</p>

        <div class="flex flex-wrap gap-2 mb-8">
          <a
            href="/contents"
            class={`px-3 py-1.5 rounded-full text-sm border ${!categorySlug ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-600'}`}
          >
            همه
          </a>
          {categories.map((cat) => (
            <a
              href={`/contents?category=${cat.slug}`}
              class={`px-3 py-1.5 rounded-full text-sm border ${categorySlug === cat.slug ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-600'}`}
            >
              {cat.nameFa}
            </a>
          ))}
        </div>

        {items.length === 0 ? (
          <div class="bg-white border rounded-2xl p-10 text-center text-gray-500">
            هنوز محتوایی در این دسته منتشر نشده است.
          </div>
        ) : (
          <div class="grid gap-6 md:grid-cols-2">
            {items.map((item) => (
              <a
                href={`/contents/${item.slug}`}
                class="block bg-white border rounded-2xl p-6 hover:shadow-md transition-shadow"
              >
                {item.categoryNameFa && (
                  <span class="inline-block text-xs text-teal-700 bg-teal-50 rounded-full px-2 py-1 mb-3">
                    {item.categoryNameFa}
                  </span>
                )}
                <h2 class="text-lg font-bold text-gray-900 mb-2">{item.title}</h2>
                {item.summary && <p class="text-gray-600 text-sm line-clamp-3">{item.summary}</p>}
              </a>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav class="flex justify-center gap-2 mt-10">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                href={`/contents?${categorySlug ? `category=${categorySlug}&` : ''}page=${p}`}
                class={`w-9 h-9 flex items-center justify-center rounded-lg border text-sm ${p === page ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300'}`}
              >
                {p}
              </a>
            ))}
          </nav>
        )}
      </main>
      <SiteFooter />
    </div>,
    { title: 'محتوای مرجع' },
  )
})

pagesRoute.get('/contents/:slug', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))
  const content = await service.getBySlug(c.req.param('slug'))

  if (!content) {
    return c.render(
      <div dir="rtl">
        <SiteHeader />
        <main class="max-w-3xl mx-auto px-4 md:px-6 py-16 text-center">
          <h1 class="text-2xl font-bold text-gray-900 mb-2">محتوا پیدا نشد</h1>
          <a href="/contents" class="text-teal-700 hover:underline">بازگشت به فهرست محتوا</a>
        </main>
        <SiteFooter />
      </div>,
      { title: 'یافت نشد' },
    )
  }

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <nav class="text-sm text-gray-500 mb-4">
          <a href="/contents" class="hover:text-teal-700">محتوای مرجع</a>
          {content.categoryNameFa && <span> / {content.categoryNameFa}</span>}
        </nav>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{content.title}</h1>

        {content.shortAnswer && (
          <div class="bg-teal-50 border border-teal-200 rounded-2xl p-5 mb-8">
            <div class="text-xs font-bold text-teal-700 mb-1">پاسخ کوتاه</div>
            <p class="text-gray-800">{content.shortAnswer}</p>
          </div>
        )}

        <article class="prose prose-neutral max-w-none whitespace-pre-line leading-8 text-gray-800">
          {content.body}
        </article>

        <div class="mt-12 border-t pt-6 flex flex-wrap gap-3">
          <a href="/login" class="bg-teal-700 text-white px-5 py-2.5 rounded-lg hover:bg-teal-800">
            پرسش خودت را در پرسش‌کده مطرح کن
          </a>
        </div>
      </main>
      <SiteFooter />
    </div>,
    { title: content.seoTitle || content.title },
  )
})

pagesRoute.get('/login', async (c) => {
  const siteKey = c.env.TURNSTILE_SITE_KEY || ''

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-md mx-auto px-4 md:px-6 py-16">
        <div class="bg-white border rounded-2xl p-8">
          <h1 class="text-xl font-bold text-gray-900 mb-2">ورود / ثبت‌نام</h1>
          <p class="text-gray-600 text-sm mb-6">
            با شمارهٔ موبایل خود وارد شوید. اگر تازه هستید، حساب شما به‌طور خودکار ساخته می‌شود.
          </p>

          <div id="otp-request-step">
            <label class="block text-sm text-gray-700 mb-1">شمارهٔ موبایل</label>
            <input
              id="phone-input"
              type="tel"
              placeholder="09xxxxxxxxx"
              class="w-full border rounded-lg px-3 py-2.5 mb-3 text-left"
              dir="ltr"
            />
            <div
              class="cf-turnstile mb-4"
              data-sitekey={siteKey}
              data-callback="onTurnstileSuccess"
            ></div>
            <button
              id="send-otp-btn"
              class="w-full bg-teal-700 text-white py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-50"
              disabled
            >
              ارسال کد تأیید
            </button>
            <p id="otp-request-error" class="text-red-600 text-sm mt-2 hidden"></p>
          </div>

          <div id="otp-verify-step" class="hidden">
            <label class="block text-sm text-gray-700 mb-1">کد ۶ رقمی ارسال‌شده</label>
            <input
              id="code-input"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="w-full border rounded-lg px-3 py-2.5 mb-3 text-center tracking-widest"
              dir="ltr"
            />
            <button id="verify-otp-btn" class="w-full bg-teal-700 text-white py-2.5 rounded-lg hover:bg-teal-800">
              تأیید و ورود
            </button>
            <p id="otp-verify-error" class="text-red-600 text-sm mt-2 hidden"></p>
          </div>
        </div>
      </main>
      <SiteFooter />

      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <script src="/static/login.js"></script>
    </div>,
    { title: 'ورود' },
  )
})
