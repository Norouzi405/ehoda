/**
 * پرسش‌کدهٔ خانواده و رسانه — server-rendered pages (D-004: Hono JSX SSR,
 * no SPA). These call the EXACT same Service layer as
 * src/routes/porseshkadeh.api.ts, never duplicate business logic. Mounted
 * at the site root in src/index.tsx (same convention as pages.tsx).
 *
 * NOTE ON TERMINOLOGY (mandatory, spec §2): the ONLY acceptable term for
 * this module anywhere in routes, UI copy or docs is «پرسش‌کده». The
 * legacy/forbidden term «پرسش‌خانه» must never appear.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createQuestionRepository } from '../repositories/question.repository'
import { createQuestionService } from '../services/question.service'
import { createResponseRepository } from '../repositories/response.repository'
import { createResponseService, type ResponseTreeNode } from '../services/response.service'
import { createSettingsRepository } from '../repositories/settings.repository'
import { createProfessionalRepository } from '../repositories/professional.repository'
import { CURRENT_USER_ID_KEY, requirePermission } from '../middleware/rbac'
import type { SortMode } from '../services/response-ranking.service'
import { SiteHeader, SiteFooter } from '../components/layout'
import type { FC } from 'hono/jsx'

export const porseshkadehPagesRoute = new Hono<{ Bindings: Bindings }>()

function services(ctx: ReturnType<typeof buildAppContext>) {
  const questionService = createQuestionService(createQuestionRepository(ctx.db), createSettingsRepository(ctx.db))
  const responseService = createResponseService(createResponseRepository(ctx.db))
  return { questionService, responseService }
}

const TIER_LABEL: Record<string, string> = {
  professor: 'استاد',
  expert: 'کارشناس',
  member_experience: 'تجربهٔ والد / مربی',
  member: 'عضو جامعه',
}

const TIER_BADGE_CLASS: Record<string, string> = {
  professor: 'bg-amber-100 text-amber-800 border-amber-200', // gold
  expert: 'bg-teal-50 text-teal-800 border-teal-200', // deep teal
  member_experience: 'bg-orange-50 text-orange-700 border-orange-200',
  member: 'bg-stone-100 text-stone-500 border-stone-200',
}

const TIER_ICON: Record<string, string> = {
  professor: 'fa-graduation-cap',
  expert: 'fa-user-doctor',
  member_experience: 'fa-hand-holding-heart',
  member: 'fa-user',
}

const TierBadge: FC<{ level: string; isEditorPick?: boolean }> = ({ level, isEditorPick }) => (
  <span class="inline-flex items-center gap-1.5 flex-wrap">
    <span class={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${TIER_BADGE_CLASS[level] || TIER_BADGE_CLASS.member}`}>
      <i class={`fas ${TIER_ICON[level] || 'fa-user'} text-[10px]`}></i>
      {TIER_LABEL[level] || 'عضو جامعه'}
    </span>
    {isEditorPick && (
      <span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border bg-rose-50 text-rose-700 border-rose-200">
        <i class="fas fa-star text-[10px]"></i>
        منتخب تحریریه
      </span>
    )}
  </span>
)

// ------------------------- List -------------------------

porseshkadehPagesRoute.get('/porseshkadeh', async (c) => {
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const categorySlug = c.req.query('category') || undefined
  const q = c.req.query('q') || undefined
  const page = c.req.query('page') ? Number(c.req.query('page')) : undefined

  const [{ items, total, pageSize }, categories] = await Promise.all([
    questionService.listPublished({ categorySlug, q, page }),
    questionService.listCategories(),
  ])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = page && page > 0 ? page : 1

  const AGE_BADGE = 'bg-teal-50 text-teal-700 border-teal-100'
  const CAT_BADGE = 'bg-amber-100 text-amber-800'

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <section class="hero-gradient border-b border-stone-200/60">
        <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h1 class="font-display text-2xl font-extrabold text-stone-800">پرسش‌کدهٔ خانواده و رسانه</h1>
            <a href="/porseshkadeh/ask" class="bg-teal-800 text-white px-5 py-2.5 rounded-full font-bold hover:bg-teal-900 text-sm transition-colors shadow-sm">
              <i class="fas fa-plus ms-1"></i>
              ثبت پرسش جدید
            </a>
          </div>
          <p class="text-stone-500 mb-6">
            پرسش‌های واقعی والدین، معلمان و مربیان — با پاسخ اساتید، کارشناسان و تجربهٔ سایر والدین.
          </p>

          <form action="/porseshkadeh" method="get" class="max-w-xl mb-2">
            <div class="search-float bg-white rounded-2xl border border-stone-200/70 p-1.5 flex items-center gap-2">
              <i class="fas fa-magnifying-glass text-stone-400 mx-3"></i>
              <input
                type="text"
                name="q"
                value={q || ''}
                placeholder="جست‌وجوی در پرسش‌کده..."
                class="flex-1 bg-transparent border-0 outline-none py-2.5 text-stone-800 placeholder:text-stone-400"
              />
              <button type="submit" class="bg-teal-800 hover:bg-teal-900 text-white rounded-xl px-4 py-2.5 text-sm font-bold transition-colors">
                جست‌وجو
              </button>
            </div>
          </form>
        </main>
      </section>

      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div class="flex flex-wrap gap-2 mb-8">
          <a
            href="/porseshkadeh"
            class={`px-4 py-1.5 rounded-full text-sm border transition-colors ${!categorySlug ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-stone-600 border-stone-200 hover:border-teal-700'}`}
          >
            همه
          </a>
          {categories.map((cat) => (
            <a
              href={`/porseshkadeh?category=${cat.slug}`}
              class={`px-4 py-1.5 rounded-full text-sm border transition-colors ${categorySlug === cat.slug ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-stone-600 border-stone-200 hover:border-teal-700'}`}
            >
              {cat.nameFa}
            </a>
          ))}
        </div>

        {items.length === 0 ? (
          <div class="bg-white border border-stone-200/70 rounded-2xl p-10 text-center text-stone-400">
            هنوز پرسشی در این دسته منتشر نشده است.
          </div>
        ) : (
          <div class="grid gap-6 md:grid-cols-2">
            {items.map((item) => (
              <a href={`/porseshkadeh/${item.slug}`} class="soft-card block bg-white rounded-2xl border border-stone-200/70 shadow-sm hover:shadow-md p-6">
                <div class="flex items-center gap-2 mb-3 flex-wrap">
                  {item.categoryNameFa && (
                    <span class={`inline-block text-xs font-bold rounded-lg px-2.5 py-1 ${CAT_BADGE}`}>
                      {item.categoryNameFa}
                    </span>
                  )}
                  {item.ageGroupLabelFa && (
                    <span class={`inline-block text-xs font-bold rounded-lg px-2.5 py-1 border ${AGE_BADGE}`}>
                      {item.ageGroupLabelFa}
                    </span>
                  )}
                </div>
                <h2 class="text-lg font-extrabold text-stone-800 mb-2">{item.publicTitle}</h2>
                {item.publicBody && <p class="text-stone-500 text-sm line-clamp-2 mb-3">{item.publicBody}</p>}
                <div class="flex items-center gap-3 text-xs text-stone-400 pt-3 border-t border-stone-100">
                  <span class="flex items-center gap-1"><i class="fas fa-comment-dots"></i> {item.responsesCount} پاسخ</span>
                  {item.publishedAt && (
                    <span class="flex items-center gap-1">
                      <i class="fas fa-clock"></i>
                      {new Date(item.publishedAt).toLocaleDateString('fa-IR')}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav class="flex justify-center gap-2 mt-10">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                href={`/porseshkadeh?${categorySlug ? `category=${categorySlug}&` : ''}page=${p}`}
                class={`w-9 h-9 flex items-center justify-center rounded-full border text-sm transition-colors ${p === currentPage ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-stone-600 border-stone-200'}`}
              >
                {p}
              </a>
            ))}
          </nav>
        )}
      </main>
      <SiteFooter />
    </div>,
    { title: 'پرسش‌کده' },
  )
})

// ------------------------- Ask wizard -------------------------

porseshkadehPagesRoute.get('/porseshkadeh/ask', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const [categories, ageGroups] = await Promise.all([questionService.listCategories(), questionService.listAgeGroups()])
  const siteKey = c.env.TURNSTILE_SITE_KEY || ''

  if (!userId) {
    return c.render(
      <div dir="rtl">
        <SiteHeader />
        <main class="max-w-md mx-auto px-4 md:px-6 py-16 text-center">
          <div class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-8">
            <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-pen text-lg"></i>
            </div>
            <h1 class="font-display text-xl font-extrabold text-stone-800 mb-3">برای ثبت پرسش وارد شوید</h1>
            <p class="text-stone-500 text-sm mb-6">برای مطرح‌کردن پرسش در پرسش‌کده، ابتدا باید وارد حساب خود شوید.</p>
            <a href="/login" class="bg-teal-800 text-white px-6 py-3 rounded-full font-bold hover:bg-teal-900 inline-block transition-colors">
              ورود / ثبت‌نام
            </a>
          </div>
        </main>
        <SiteFooter />
      </div>,
      { title: 'ورود لازم است' },
    )
  }

  const fieldLabel = 'block text-sm font-bold text-stone-600 mb-1.5'
  const fieldInput = 'w-full border border-stone-200 rounded-xl px-3 py-2.5 mb-4 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors'

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-2xl mx-auto px-4 md:px-6 py-10">
        <h1 class="font-display text-2xl font-extrabold text-stone-800 mb-2">ثبت پرسش در پرسش‌کده</h1>
        <p class="text-stone-500 mb-8 text-sm">
          پرسش شما پس از بررسی و پالایش هویتی توسط ناظران، به‌صورت ناشناس در پرسش‌کده منتشر می‌شود.
        </p>

        {/* Step indicator */}
        <div class="flex items-center gap-2 mb-8 text-sm" id="wizard-steps">
          <span data-step-indicator="1" class="flex-1 text-center py-2 rounded-full font-bold bg-teal-800 text-white transition-colors">۱. طبقه‌بندی</span>
          <span data-step-indicator="2" class="flex-1 text-center py-2 rounded-full font-bold bg-stone-100 text-stone-400 transition-colors">۲. شرح مسئله</span>
          <span data-step-indicator="3" class="flex-1 text-center py-2 rounded-full font-bold bg-stone-100 text-stone-400 transition-colors">۳. حریم خصوصی و ارسال</span>
        </div>

        <form id="ask-wizard-form">
          {/* ---- Step 1: classification ---- */}
          <section data-step="1" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4">
            <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
              <i class="fas fa-tags text-teal-800"></i>
              طبقه‌بندی پرسش
            </h2>

            <label class={fieldLabel}>نقش شما</label>
            <select name="authorRole" class={fieldInput}>
              <option value="mother">مادر</option>
              <option value="father">پدر</option>
              <option value="teacher">معلم</option>
              <option value="mentor">مربی</option>
              <option value="school_counselor">مشاور مدرسه</option>
              <option value="other">سایر</option>
            </select>

            <label class={fieldLabel}>فضای مسئله</label>
            <select name="contextSpace" class={fieldInput}>
              <option value="home">خانه</option>
              <option value="school">مدرسه</option>
              <option value="couple">زوجین</option>
            </select>

            <label class={fieldLabel}>دسته‌بندی موضوع</label>
            <select name="categorySlug" class={fieldInput}>
              <option value="">— انتخاب کنید —</option>
              {categories.map((cat) => (
                <option value={cat.slug}>{cat.nameFa}</option>
              ))}
            </select>

            <label class={fieldLabel}>گروه سنی فرزند</label>
            <select name="ageGroupSlug" class={fieldInput}>
              <option value="">— انتخاب کنید —</option>
              {ageGroups.map((ag) => (
                <option value={ag.slug}>{ag.labelFa}</option>
              ))}
            </select>

            <label class="flex items-center gap-2 mb-4 text-sm text-stone-600">
              <input type="checkbox" name="isRecurring" class="accent-teal-800" />
              این مسئله تکرارشونده است.
            </label>

            <label class={fieldLabel}>سطح فوریت</label>
            <select name="urgencyLevel" class="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors">
              <option value="normal">عادی</option>
              <option value="concerning">نگران‌کننده</option>
              <option value="urgent">فوری</option>
            </select>

            <div class="mt-6 flex justify-end">
              <button type="button" data-next="2" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                مرحلهٔ بعد
              </button>
            </div>
          </section>

          {/* ---- Step 2: problem statement ---- */}
          <section data-step="2" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 hidden">
            <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
              <i class="fas fa-pen-to-square text-teal-800"></i>
              شرح مسئله
            </h2>

            <label class={fieldLabel}>عنوان کوتاه پرسش</label>
            <input name="rawTitle" type="text" class={fieldInput} placeholder="مثلاً: فرزندم زمان زیادی صرف بازی می‌کند" />

            <label class={fieldLabel}>دقیقاً چه اتفاقی افتاده است؟ (حداقل ۵۰ کاراکتر)</label>
            <textarea name="rawWhatHappened" rows="5" class={fieldInput}></textarea>

            <label class={fieldLabel}>از چه زمانی این موضوع مطرح است؟</label>
            <input name="rawSinceWhen" type="text" class={fieldInput} />

            <label class={fieldLabel}>تا الان چه کاری انجام داده‌اید؟</label>
            <textarea name="rawTriedSoFar" rows="3" class={fieldInput}></textarea>

            <label class={fieldLabel}>دقیقاً چه کمکی از پرسش‌کده می‌خواهید؟</label>
            <textarea name="rawHelpRequested" rows="3" class="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors"></textarea>

            <div class="mt-6 flex justify-between">
              <button type="button" data-prev="1" class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
                مرحلهٔ قبل
              </button>
              <button type="button" data-next="3" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                مرحلهٔ بعد
              </button>
            </div>
          </section>

          {/* ---- Step 3: privacy/consent + captcha + submit ---- */}
          <section data-step="3" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 hidden">
            <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
              <i class="fas fa-shield-heart text-teal-800"></i>
              حریم خصوصی و ارسال
            </h2>

            <div class="mb-4">
              <label class="block text-sm font-bold text-stone-600 mb-2">انتخاب انتشار</label>
              <label class="flex items-start gap-2 mb-2 text-sm text-stone-600 p-3 rounded-xl border border-stone-200 hover:border-teal-700 cursor-pointer transition-colors">
                <input type="radio" name="publicationChoice" value="publish_after_anonymization" checked class="accent-teal-800 mt-0.5" />
                <span>پس از پالایش هویتی توسط ناظران، پرسشم به‌صورت ناشناس در پرسش‌کده منتشر شود.</span>
              </label>
              <label class="flex items-start gap-2 text-sm text-stone-600 p-3 rounded-xl border border-stone-200 hover:border-teal-700 cursor-pointer transition-colors">
                <input type="radio" name="publicationChoice" value="private_referral_only" class="accent-teal-800 mt-0.5" />
                <span>پرسشم فقط به‌صورت خصوصی به یک استاد/کارشناس ارجاع شود و منتشر نشود.</span>
              </label>
            </div>

            <label class="flex items-start gap-2 mb-4 text-sm text-stone-600">
              <input type="checkbox" id="consent-checkbox" required class="accent-teal-800 mt-0.5" />
              <span>می‌پذیرم که اطلاعات این پرسش پیش از انتشار عمومی، توسط ناظران بازبینی و هویت من حذف می‌شود.</span>
            </label>

            <div class="cf-turnstile mb-4" data-sitekey={siteKey} data-callback="onAskTurnstileSuccess"></div>

            <p id="crisis-triage-note" class="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 hidden">
              با توجه به محتوای پرسش شما، این مورد به‌صورت خصوصی و مستقیم به یک متخصص ارجاع می‌شود و در فهرست عمومی منتشر نخواهد شد.
            </p>

            <div class="flex justify-between">
              <button type="button" data-prev="2" class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
                مرحلهٔ قبل
              </button>
              <button type="submit" id="submit-question-btn" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 disabled:opacity-50 transition-colors" disabled>
                ثبت پرسش
              </button>
            </div>
            <p id="submit-question-error" class="text-red-600 text-sm mt-3 hidden"></p>
          </section>
        </form>
      </main>
      <SiteFooter />

      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <script src="/static/ask-wizard.js"></script>
    </div>,
    { title: 'ثبت پرسش' },
  )
})

// ------------------------- Crisis referral confirmation page -------------------------

porseshkadehPagesRoute.get('/porseshkadeh/crisis-help', async (c) => (
  c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-2xl mx-auto px-4 md:px-6 py-16">
        <div class="bg-amber-50 border border-amber-200/70 rounded-2xl p-8 text-center">
          <div class="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-hand-holding-heart text-xl"></i>
          </div>
          <h1 class="font-display text-xl font-extrabold text-amber-900 mb-3">پرسش شما به‌صورت خصوصی ثبت شد</h1>
          <p class="text-stone-600 mb-4">
            با توجه به محتوای پرسش شما، این موضوع حساس تشخیص داده شد و به‌صورت کاملاً خصوصی و مستقیم برای بررسی به
            یک استاد/کارشناس ارجاع شده است. این پرسش در فهرست عمومی پرسش‌کده منتشر نخواهد شد.
          </p>
          <p class="text-stone-600 mb-6">
            اگر احساس می‌کنید وضعیت فوری و اضطراری است، لطفاً همین حالا با اورژانس اجتماعی (۱۲۳) یا یک متخصص
            روان‌شناسی تماس بگیرید. تیم پرسش‌کده در سریع‌ترین زمان ممکن پاسخ خصوصی شما را پیگیری می‌کند.
          </p>
          <a href="/porseshkadeh" class="text-teal-800 hover:underline text-sm font-bold">بازگشت به پرسش‌کده ←</a>
        </div>
      </main>
      <SiteFooter />
    </div>,
    { title: 'ارجاع خصوصی ثبت شد' },
  )
))

// ------------------------- Detail page with response tree -------------------------

const TreeNodeView: FC<{ node: ResponseTreeNode; depth: number; maxDepth: number; questionSlug: string }> = ({ node, depth, maxDepth, questionSlug }) => {
  const hiddenClass = depth >= maxDepth ? 'reply-collapsed hidden md:block' : ''
  return (
    <div class={`reply-rail pr-4 ${depth > 0 ? 'mt-4' : ''} ${hiddenClass}`} data-depth={depth}>
      <div class="soft-card bg-white rounded-2xl border border-stone-200/70 shadow-sm p-5" id={`response-${node.id}`}>
        <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
          <TierBadge level={node.authorLevelSnapshot} isEditorPick={node.isEditorPick} />
          <span class="text-xs text-stone-400">{new Date(node.createdAt).toLocaleDateString('fa-IR')}</span>
        </div>
        {node.replyToDisplayName && (
          <div class="text-xs text-stone-400 mb-1">در پاسخ به {node.replyToDisplayName}</div>
        )}
        <p class={`text-stone-700 whitespace-pre-line leading-7 ${node.isTombstone ? 'italic text-stone-400' : ''}`}>{node.body}</p>
        {!node.isTombstone && (
          <div class="flex items-center gap-4 mt-3 text-sm">
            <button
              class="vote-btn text-stone-400 hover:text-teal-800 flex items-center gap-1 transition-colors"
              data-response-id={node.id}
            >
              <i class="fas fa-thumbs-up"></i> مفید بود ({node.helpfulVotesCount})
            </button>
            <button class="reply-btn text-stone-400 hover:text-teal-800 transition-colors" data-response-id={node.id} data-display-name={node.authorDisplayName}>
              پاسخ
            </button>
            <button class="report-btn text-stone-400 hover:text-red-600 transition-colors" data-response-id={node.id}>
              گزارش تخلف
            </button>
          </div>
        )}
      </div>

      {node.replies.length > 0 && (
        <div class="mt-2">
          {depth >= maxDepth && (
            <button class="show-more-replies text-teal-800 text-sm hover:underline mb-2 font-bold" data-target={`replies-of-${node.id}`}>
              نمایش {node.replies.length} پاسخ بیشتر
            </button>
          )}
          <div id={`replies-of-${node.id}`} class={depth >= maxDepth ? 'hidden' : ''}>
            {node.replies.map((child) => (
              <TreeNodeView node={child} depth={depth + 1} maxDepth={maxDepth} questionSlug={questionSlug} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


porseshkadehPagesRoute.get('/porseshkadeh/:slug', async (c) => {
  const ctx = buildAppContext(c)
  const { questionService, responseService } = services(ctx)
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined

  const question = await questionService.getPublishedBySlug(c.req.param('slug'))
  if (!question) {
    return c.render(
      <div dir="rtl">
        <SiteHeader />
        <main class="max-w-3xl mx-auto px-4 md:px-6 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-magnifying-glass text-xl"></i>
          </div>
          <h1 class="font-display text-2xl font-bold text-stone-800 mb-2">پرسش پیدا نشد</h1>
          <a href="/porseshkadeh" class="text-teal-800 font-bold hover:underline">بازگشت به پرسش‌کده</a>
        </main>
        <SiteFooter />
      </div>,
      { title: 'یافت نشد' },
    )
  }

  const sortMode = (c.req.query('sort') as SortMode) || 'default'
  const tree = await responseService.getTreeForQuestion(question.id, sortMode, false)

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'default', label: 'پیش‌فرض (بر اساس سطح اعتبار)' },
    { value: 'newest', label: 'جدیدترین' },
    { value: 'helpful', label: 'مفیدترین' },
    { value: 'professionals_only', label: 'فقط اساتید و کارشناسان' },
    { value: 'parent_experience_only', label: 'فقط تجارب والدین' },
  ]

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <nav class="text-sm text-stone-400 mb-4 flex items-center gap-1.5">
          <a href="/porseshkadeh" class="hover:text-teal-800 transition-colors">پرسش‌کده</a>
          {question.categoryNameFa && (
            <>
              <i class="fas fa-angle-left text-[10px]"></i>
              <span class="text-stone-500">{question.categoryNameFa}</span>
            </>
          )}
        </nav>

        <div class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 md:p-8 mb-8">
          <div class="flex flex-wrap items-center gap-2 mb-4">
            {question.categoryNameFa && (
              <span class="bg-amber-100 text-amber-800 rounded-lg px-2.5 py-1 text-xs font-bold">
                {question.categoryNameFa}
              </span>
            )}
            {question.ageGroupLabelFa && (
              <span class="bg-teal-50 text-teal-700 border border-teal-100 rounded-lg px-2.5 py-1 text-xs font-bold">
                {question.ageGroupLabelFa}
              </span>
            )}
          </div>

          <h1 class="font-display text-2xl md:text-3xl font-extrabold text-stone-800 mb-4 leading-snug">{question.publicTitle}</h1>

          {question.publicBody && (
            <article class="prose prose-neutral max-w-none whitespace-pre-line leading-8 text-stone-600">
              {question.publicBody}
            </article>
          )}

          {question.publishedAt && (
            <div class="flex items-center gap-1.5 text-xs text-stone-400 mt-5 pt-5 border-t border-stone-100">
              <i class="fas fa-calendar-days"></i>
              <span>ثبت شده در پرسش‌کده در {new Date(question.publishedAt).toLocaleDateString('fa-IR')}</span>
            </div>
          )}
        </div>

        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 class="font-extrabold text-stone-800 flex items-center gap-2">
            <i class="fas fa-comments text-teal-800"></i>
            {tree.length} پاسخ
          </h2>
          <form method="get" class="flex items-center gap-2">
            <label class="text-sm text-stone-500">ترتیب:</label>
            <select
              name="sort"
              class="bg-white border border-stone-200/70 rounded-full px-3 py-1.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-800/20"
              onchange="this.form.submit()"
            >
              {sortOptions.map((opt) => (
                <option value={opt.value} selected={opt.value === sortMode}>{opt.label}</option>
              ))}
            </select>
          </form>
        </div>

        <div id="response-tree" class="space-y-4 mb-10">
          {tree.length === 0 ? (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-10 text-center text-stone-400 text-sm">
              <i class="fas fa-comment-dots text-2xl mb-3 block"></i>
              هنوز پاسخی ثبت نشده است. اولین نفری باشید که پاسخ می‌دهد.
            </div>
          ) : (
            tree.map((node) => <TreeNodeView node={node} depth={0} maxDepth={3} questionSlug={question.slug} />)
          )}
        </div>

        {userId ? (
          <div class="bg-white border border-stone-200/70 shadow-sm rounded-2xl p-6" id="answer-box">
            <h3 class="font-extrabold text-stone-800 mb-3 flex items-center gap-2">
              <i class="fas fa-pen text-teal-800"></i>
              پاسخ شما
            </h3>
            <p id="reply-context" class="text-xs text-teal-800 mb-2 hidden"></p>
            <textarea
              id="answer-body"
              rows="4"
              class="w-full border border-stone-200/70 rounded-xl px-3 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-teal-800/20 text-stone-700 placeholder:text-stone-400"
              placeholder="تجربه یا راهنمایی خودتان را بنویسید..."
            ></textarea>
            <label id="as-experience-label" class="flex items-center gap-2 mb-3 text-sm text-stone-600">
              <input type="checkbox" id="as-experience-checkbox" class="accent-teal-800" />
              این یک تجربهٔ شخصی من به‌عنوان والد/مربی است.
            </label>
            <div class="flex justify-end gap-2">
              <button
                id="cancel-reply-btn"
                class="bg-white border border-stone-200 text-stone-600 px-4 py-2 rounded-full text-sm hidden hover:bg-stone-50 transition-colors"
              >
                لغو پاسخ به
              </button>
              <button
                id="submit-answer-btn"
                class="bg-teal-800 text-white px-5 py-2.5 rounded-full hover:bg-teal-900 text-sm font-bold transition-colors"
              >
                ارسال
              </button>
            </div>
            <p id="answer-error" class="text-red-600 text-sm mt-3 hidden"></p>
          </div>
        ) : (
          <div class="bg-white border border-stone-200/70 rounded-2xl p-6 text-center text-sm text-stone-500">
            برای ثبت پاسخ، <a href="/login" class="text-teal-800 font-bold hover:underline">وارد شوید</a>.
          </div>
        )}
      </main>
      <SiteFooter />

      <script>{`window.__QUESTION_SLUG__ = ${JSON.stringify(question.slug)};`}</script>
      <script src="/static/question-detail.js"></script>
    </div>,
    { title: question.publicTitle || 'پرسش' },
  )
})

// ------------------------- Professional cartable (SSR) -------------------------

porseshkadehPagesRoute.get('/porseshkadeh/cartable', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) {
    return c.redirect('/login')
  }

  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)

  if (!profile) {
    return c.render(
      <div dir="rtl">
        <SiteHeader />
        <main class="max-w-2xl mx-auto px-4 md:px-6 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-4">
            <i class="fas fa-user-lock text-xl"></i>
          </div>
          <h1 class="font-display text-xl font-bold text-stone-800 mb-3">این صفحه فقط برای اساتید و کارشناسان است</h1>
          <p class="text-stone-500">حساب شما دسترسی کارتابل تخصصی ندارد.</p>
        </main>
        <SiteFooter />
      </div>,
      { title: 'کارتابل' },
    )
  }

  const [assigned, categoryIds] = await Promise.all([
    questionService.listAssignedTo(userId),
    professionalRepo.listExpertiseCategoryIds(profile.id),
  ])
  const inExpertise = await questionService.listInExpertiseAreas(categoryIds, userId)

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-4xl mx-auto px-4 md:px-6 py-10">
        <div class="flex items-center gap-3 mb-2">
          <span class="w-11 h-11 rounded-xl bg-teal-800 text-amber-300 flex items-center justify-center">
            <i class="fas fa-briefcase"></i>
          </span>
          <h1 class="font-display text-2xl font-extrabold text-stone-800">
            کارتابل {profile.credentialType === 'professor' ? 'استاد' : 'کارشناس'}
          </h1>
        </div>
        <p class="text-stone-500 mb-8 text-sm">پرسش‌های ارجاع‌شده و پرسش‌های منتشرشده در حوزهٔ تخصص شما.</p>

        <section class="mb-10">
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-inbox text-teal-800 text-sm"></i>
            پرسش‌های ارجاع‌شده به شما ({assigned.length})
          </h2>
          {assigned.length === 0 ? (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-6 text-center text-stone-400 text-sm">موردی ارجاع نشده است.</div>
          ) : (
            <div class="grid gap-3">
              {assigned.map((item) => (
                <a
                  href={`/porseshkadeh/cartable/respond/${item.questionId}`}
                  class="soft-card block bg-white border border-stone-200/70 shadow-sm hover:shadow-md rounded-2xl p-5 transition-all"
                >
                  <div class="font-bold text-stone-800">{item.publicTitle || '(در انتظار بازبینی ناظر)'}</div>
                  <div class="text-xs text-stone-400 mt-1 flex items-center gap-1">
                    <i class="fas fa-circle-info"></i>
                    وضعیت ارجاع: {item.status}
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-layer-group text-teal-800 text-sm"></i>
            پرسش‌های منتشرشده در حوزهٔ تخصص شما ({inExpertise.total})
          </h2>
          {inExpertise.items.length === 0 ? (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-6 text-center text-stone-400 text-sm">
              موردی یافت نشد. (اگر انتظار می‌رود موردی باشد، بررسی کنید که حوزه‌های تخصص شما با دسته‌بندی‌های محتوا هم‌نام باشند.)
            </div>
          ) : (
            <div class="grid gap-3">
              {inExpertise.items.map((item) => (
                <a
                  href={`/porseshkadeh/cartable/respond/${item.id}`}
                  class="soft-card block bg-white border border-stone-200/70 shadow-sm hover:shadow-md rounded-2xl p-5 transition-all"
                >
                  <div class="font-bold text-stone-800">{item.publicTitle}</div>
                  <div class="text-xs text-stone-400 mt-1 flex items-center gap-1">
                    <i class="fas fa-comments"></i>
                    {item.responsesCount} پاسخ
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>,
    { title: 'کارتابل تخصصی' },
  )
})

porseshkadehPagesRoute.get('/porseshkadeh/cartable/respond/:questionId', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.redirect('/login')

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)
  if (!profile) return c.redirect('/porseshkadeh/cartable')

  const questionId = Number(c.req.param('questionId'))
  const questionRepo = createQuestionRepository(ctx.db)
  const question = await questionRepo.findRawById(questionId)
  if (!question) return c.notFound()

  const draft = await responseService.findMyDraft(questionId, userId)

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-2xl mx-auto px-4 md:px-6 py-10">
        <nav class="text-sm text-stone-400 mb-4">
          <a href="/porseshkadeh/cartable" class="hover:text-teal-800 transition-colors">کارتابل</a>
        </nav>

        <div class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-6">
          <h1 class="font-display text-xl font-extrabold text-stone-800 mb-2">{question.publicTitle || '(در انتظار بازبینی ناظر)'}</h1>
          {question.publicBody && <p class="text-stone-600 whitespace-pre-line leading-7">{question.publicBody}</p>}
        </div>

        <div class="bg-white border border-stone-200/70 shadow-sm rounded-2xl p-6">
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-file-pen text-teal-800"></i>
            فرم پاسخ ساختاریافته
          </h2>
          <input type="hidden" id="cartable-question-id" value={questionId} />
          <input type="hidden" id="cartable-draft-id" value={draft?.id ?? ''} />

          <label class="block text-sm text-stone-600 mb-1">خلاصهٔ مسئله (اختیاری)</label>
          <textarea
            id="meta-problem-summary"
            rows="2"
            class="w-full border border-stone-200/70 rounded-xl px-3 py-2.5 mb-4 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-800/20"
          ></textarea>

          <label class="block text-sm text-stone-600 mb-1">در این وضعیت چه کاری نباید انجام داد؟ (اختیاری)</label>
          <textarea
            id="meta-what-not-to-do"
            rows="2"
            class="w-full border border-stone-200/70 rounded-xl px-3 py-2.5 mb-4 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-800/20"
          ></textarea>

          <label class="block text-sm text-stone-600 mb-1">پاسخ اصلی</label>
          <textarea
            id="cartable-body"
            rows="6"
            class="w-full border border-stone-200/70 rounded-xl px-3 py-2.5 mb-4 text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-800/20"
          >{draft?.body || ''}</textarea>

          <div class="flex justify-end gap-2">
            <button
              id="save-draft-btn"
              class="bg-white border border-stone-200 text-stone-600 px-5 py-2.5 rounded-full text-sm hover:border-teal-700 hover:text-teal-800 transition-colors"
            >
              ذخیرهٔ پیش‌نویس
            </button>
            <button
              id="submit-for-review-btn"
              class="bg-teal-800 text-white px-5 py-2.5 rounded-full hover:bg-teal-900 text-sm font-bold transition-colors"
            >
              ارسال برای بازبینی
            </button>
          </div>
          <p id="cartable-status" class="text-sm mt-3 text-stone-400"></p>
        </div>
      </main>
      <SiteFooter />
      <script src="/static/cartable.js"></script>
    </div>,
    { title: 'پاسخ به پرسش' },
  )
})

// ------------------------- Admin moderation panels (SSR) -------------------------

porseshkadehPagesRoute.get('/admin/moderation/questions', requirePermission('question.moderate'), async (c) => {
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const status = c.req.query('status') || undefined
  const { items } = await questionService.listForModeration({ status })

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div class="flex items-center gap-3 mb-6">
          <span class="w-11 h-11 rounded-xl bg-teal-800 text-amber-300 flex items-center justify-center">
            <i class="fas fa-shield-halved"></i>
          </span>
          <h1 class="font-display text-2xl font-extrabold text-stone-800">صف نظارت پرسش‌ها</h1>
        </div>
        <div class="grid gap-4">
          {items.length === 0 && (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-8 text-center text-stone-400 text-sm">صف خالی است.</div>
          )}
          {items.map((q) => (
            <div class="bg-white border border-stone-200/70 shadow-sm rounded-2xl p-5" data-question-id={q.id}>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-500 font-bold">{q.status}</span>
                {q.isFlaggedSensitive && (
                  <span class="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-700 font-bold flex items-center gap-1">
                    <i class="fas fa-triangle-exclamation"></i>
                    پرچم بحران
                  </span>
                )}
              </div>
              <div class="font-bold text-stone-800 mb-1">{q.rawTitle}</div>
              <p class="text-stone-500 text-sm whitespace-pre-line mb-4">{q.rawWhatHappened}</p>
              <div class="flex flex-wrap gap-2 text-sm">
                <button class="mod-question-btn bg-teal-800 text-white px-3.5 py-1.5 rounded-full hover:bg-teal-900 transition-colors" data-id={q.id} data-action="approve_publish">
                  انتشار
                </button>
                <button class="mod-question-btn bg-white border border-stone-200 text-stone-600 px-3.5 py-1.5 rounded-full hover:bg-stone-50 transition-colors" data-id={q.id} data-action="reject">
                  رد
                </button>
                <button class="mod-question-btn bg-white border border-stone-200 text-stone-600 px-3.5 py-1.5 rounded-full hover:bg-stone-50 transition-colors" data-id={q.id} data-action="crisis_referral">
                  ارجاع بحران
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
      <script src="/static/admin-moderation.js"></script>
    </div>,
    { title: 'نظارت بر پرسش‌ها' },
  )
})

porseshkadehPagesRoute.get('/admin/moderation/responses', requirePermission('response.moderate'), async (c) => {
  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const status = c.req.query('status') || undefined
  const items = await responseService.listForModeration(status)

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div class="flex items-center gap-3 mb-6">
          <span class="w-11 h-11 rounded-xl bg-teal-800 text-amber-300 flex items-center justify-center">
            <i class="fas fa-comments"></i>
          </span>
          <h1 class="font-display text-2xl font-extrabold text-stone-800">صف نظارت پاسخ‌ها</h1>
        </div>
        <div class="grid gap-4">
          {items.length === 0 && (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-8 text-center text-stone-400 text-sm">صف خالی است.</div>
          )}
          {items.map((r) => (
            <div class="bg-white border border-stone-200/70 shadow-sm rounded-2xl p-5" data-response-id={r.id}>
              <div class="flex items-center justify-between mb-2">
                <TierBadge level={r.authorLevelSnapshot} isEditorPick={r.isEditorPick} />
                <span class="text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-500 font-bold">{r.status}</span>
              </div>
              <p class="text-stone-600 text-sm whitespace-pre-line mb-4">{r.body}</p>
              <div class="flex flex-wrap gap-2 text-sm">
                <button class="mod-response-btn bg-teal-800 text-white px-3.5 py-1.5 rounded-full hover:bg-teal-900 transition-colors" data-id={r.id} data-action="approve">
                  تأیید
                </button>
                <button class="mod-response-btn bg-white border border-stone-200 text-stone-600 px-3.5 py-1.5 rounded-full hover:bg-stone-50 transition-colors" data-id={r.id} data-action="hide">
                  پنهان کردن
                </button>
                <button class="mod-response-btn bg-white border border-stone-200 text-stone-600 px-3.5 py-1.5 rounded-full hover:bg-stone-50 transition-colors" data-id={r.id} data-action="delete">
                  حذف (تومبستون)
                </button>
                <button class="mod-response-btn bg-amber-100 text-amber-800 px-3.5 py-1.5 rounded-full hover:bg-amber-200 transition-colors font-bold" data-id={r.id} data-action="editor_pick">
                  منتخب تحریریه
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
      <script src="/static/admin-moderation.js"></script>
    </div>,
    { title: 'نظارت بر پاسخ‌ها' },
  )
})

porseshkadehPagesRoute.get('/admin/moderation/reports', requirePermission('moderation.resolve_report'), async (c) => {
  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const status = c.req.query('status') || undefined
  const items = await responseService.listReports(status)

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div class="flex items-center gap-3 mb-6">
          <span class="w-11 h-11 rounded-xl bg-teal-800 text-amber-300 flex items-center justify-center">
            <i class="fas fa-flag"></i>
          </span>
          <h1 class="font-display text-2xl font-extrabold text-stone-800">صف گزارش‌های تخلف</h1>
        </div>
        <div class="grid gap-4">
          {items.length === 0 && (
            <div class="bg-white border border-stone-200/70 rounded-2xl p-8 text-center text-stone-400 text-sm">صف خالی است.</div>
          )}
          {items.map((r) => (
            <div class="bg-white border border-stone-200/70 shadow-sm rounded-2xl p-5" data-report-id={r.id}>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-bold">{r.reason}</span>
                <span class="text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-500 font-bold">{r.status}</span>
              </div>
              <p class="text-stone-600 text-sm whitespace-pre-line mb-1">پاسخ گزارش‌شده: {r.responseBody}</p>
              {r.note && <p class="text-stone-400 text-xs mb-4">یادداشت گزارش‌دهنده: {r.note}</p>}
              <div class="flex flex-wrap gap-2 text-sm items-center">
                <select
                  class="report-penalty-select bg-white border border-stone-200/70 rounded-full px-3 py-1.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-800/20"
                  data-id={r.id}
                >
                  <option value="none">بدون مجازات</option>
                  <option value="delete_comment">حذف پاسخ</option>
                  <option value="warn_user">اخطار به کاربر</option>
                  <option value="suspend_user">تعلیق موقت کاربر</option>
                </select>
                <button class="report-resolve-btn bg-teal-800 text-white px-3.5 py-1.5 rounded-full hover:bg-teal-900 transition-colors" data-id={r.id} data-status="resolved">
                  رسیدگی شد
                </button>
                <button class="report-resolve-btn bg-white border border-stone-200 text-stone-600 px-3.5 py-1.5 rounded-full hover:bg-stone-50 transition-colors" data-id={r.id} data-status="dismissed">
                  رد گزارش
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
      <script src="/static/admin-moderation.js"></script>
    </div>,
    { title: 'گزارش‌های تخلف' },
  )
})
