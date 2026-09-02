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
  professor: 'bg-amber-100 text-amber-800 border-amber-300', // gold
  expert: 'bg-slate-100 text-slate-700 border-slate-300', // silver
  member_experience: 'bg-teal-50 text-teal-700 border-teal-200',
  member: 'bg-gray-100 text-gray-600 border-gray-200',
}

const TierBadge: FC<{ level: string; isEditorPick?: boolean }> = ({ level, isEditorPick }) => (
  <span class="inline-flex items-center gap-1">
    <span class={`text-xs px-2 py-0.5 rounded-full border ${TIER_BADGE_CLASS[level] || TIER_BADGE_CLASS.member}`}>
      {TIER_LABEL[level] || 'عضو جامعه'}
    </span>
    {isEditorPick && (
      <span class="text-xs px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
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
  const page = c.req.query('page') ? Number(c.req.query('page')) : undefined

  const [{ items, total, pageSize }, categories] = await Promise.all([
    questionService.listPublished({ categorySlug, page }),
    questionService.listCategories(),
  ])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = page && page > 0 ? page : 1

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h1 class="text-2xl font-bold text-gray-900">پرسش‌کدهٔ خانواده و رسانه</h1>
          <a href="/porseshkadeh/ask" class="bg-teal-700 text-white px-5 py-2.5 rounded-lg hover:bg-teal-800 text-sm">
            ثبت پرسش جدید
          </a>
        </div>
        <p class="text-gray-600 mb-8">
          پرسش‌های واقعی والدین، معلمان و مربیان — با پاسخ اساتید، کارشناسان و تجربهٔ سایر والدین.
        </p>

        <div class="flex flex-wrap gap-2 mb-8">
          <a
            href="/porseshkadeh"
            class={`px-3 py-1.5 rounded-full text-sm border ${!categorySlug ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-600'}`}
          >
            همه
          </a>
          {categories.map((cat) => (
            <a
              href={`/porseshkadeh?category=${cat.slug}`}
              class={`px-3 py-1.5 rounded-full text-sm border ${categorySlug === cat.slug ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-600'}`}
            >
              {cat.nameFa}
            </a>
          ))}
        </div>

        {items.length === 0 ? (
          <div class="bg-white border rounded-2xl p-10 text-center text-gray-500">
            هنوز پرسشی در این دسته منتشر نشده است.
          </div>
        ) : (
          <div class="grid gap-4">
            {items.map((item) => (
              <a href={`/porseshkadeh/${item.slug}`} class="block bg-white border rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                  {item.categoryNameFa && (
                    <span class="inline-block text-xs text-teal-700 bg-teal-50 rounded-full px-2 py-1">
                      {item.categoryNameFa}
                    </span>
                  )}
                  {item.ageGroupLabelFa && (
                    <span class="inline-block text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-1">
                      {item.ageGroupLabelFa}
                    </span>
                  )}
                </div>
                <h2 class="text-lg font-bold text-gray-900 mb-2">{item.publicTitle}</h2>
                {item.publicBody && <p class="text-gray-600 text-sm line-clamp-2">{item.publicBody}</p>}
                <div class="text-xs text-gray-400 mt-3">{item.responsesCount} پاسخ</div>
              </a>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav class="flex justify-center gap-2 mt-10">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                href={`/porseshkadeh?${categorySlug ? `category=${categorySlug}&` : ''}page=${p}`}
                class={`w-9 h-9 flex items-center justify-center rounded-lg border text-sm ${p === currentPage ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-gray-700 border-gray-300'}`}
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
          <div class="bg-white border rounded-2xl p-8">
            <h1 class="text-xl font-bold text-gray-900 mb-3">برای ثبت پرسش وارد شوید</h1>
            <p class="text-gray-600 text-sm mb-6">برای مطرح‌کردن پرسش در پرسش‌کده، ابتدا باید وارد حساب خود شوید.</p>
            <a href="/login" class="bg-teal-700 text-white px-6 py-3 rounded-lg hover:bg-teal-800 inline-block">
              ورود / ثبت‌نام
            </a>
          </div>
        </main>
        <SiteFooter />
      </div>,
      { title: 'ورود لازم است' },
    )
  }

  return c.render(
    <div dir="rtl">
      <SiteHeader />
      <main class="max-w-2xl mx-auto px-4 md:px-6 py-10">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">ثبت پرسش در پرسش‌کده</h1>
        <p class="text-gray-600 mb-8 text-sm">
          پرسش شما پس از بررسی و پالایش هویتی توسط ناظران، به‌صورت ناشناس در پرسش‌کده منتشر می‌شود.
        </p>

        {/* Step indicator */}
        <div class="flex items-center gap-2 mb-8 text-sm" id="wizard-steps">
          <span data-step-indicator="1" class="flex-1 text-center py-2 rounded-lg bg-teal-700 text-white">۱. طبقه‌بندی</span>
          <span data-step-indicator="2" class="flex-1 text-center py-2 rounded-lg bg-gray-100 text-gray-500">۲. شرح مسئله</span>
          <span data-step-indicator="3" class="flex-1 text-center py-2 rounded-lg bg-gray-100 text-gray-500">۳. حریم خصوصی و ارسال</span>
        </div>

        <form id="ask-wizard-form">
          {/* ---- Step 1: classification ---- */}
          <section data-step="1" class="bg-white border rounded-2xl p-6 mb-4">
            <h2 class="font-bold text-gray-900 mb-4">طبقه‌بندی پرسش</h2>

            <label class="block text-sm text-gray-700 mb-1">نقش شما</label>
            <select name="authorRole" class="w-full border rounded-lg px-3 py-2.5 mb-4">
              <option value="mother">مادر</option>
              <option value="father">پدر</option>
              <option value="teacher">معلم</option>
              <option value="mentor">مربی</option>
              <option value="school_counselor">مشاور مدرسه</option>
              <option value="other">سایر</option>
            </select>

            <label class="block text-sm text-gray-700 mb-1">فضای مسئله</label>
            <select name="contextSpace" class="w-full border rounded-lg px-3 py-2.5 mb-4">
              <option value="home">خانه</option>
              <option value="school">مدرسه</option>
              <option value="couple">زوجین</option>
            </select>

            <label class="block text-sm text-gray-700 mb-1">دسته‌بندی موضوع</label>
            <select name="categorySlug" class="w-full border rounded-lg px-3 py-2.5 mb-4">
              <option value="">— انتخاب کنید —</option>
              {categories.map((cat) => (
                <option value={cat.slug}>{cat.nameFa}</option>
              ))}
            </select>

            <label class="block text-sm text-gray-700 mb-1">گروه سنی فرزند</label>
            <select name="ageGroupSlug" class="w-full border rounded-lg px-3 py-2.5 mb-4">
              <option value="">— انتخاب کنید —</option>
              {ageGroups.map((ag) => (
                <option value={ag.slug}>{ag.labelFa}</option>
              ))}
            </select>

            <label class="flex items-center gap-2 mb-4 text-sm text-gray-700">
              <input type="checkbox" name="isRecurring" />
              این مسئله تکرارشونده است.
            </label>

            <label class="block text-sm text-gray-700 mb-1">سطح فوریت</label>
            <select name="urgencyLevel" class="w-full border rounded-lg px-3 py-2.5">
              <option value="normal">عادی</option>
              <option value="concerning">نگران‌کننده</option>
              <option value="urgent">فوری</option>
            </select>

            <div class="mt-6 flex justify-end">
              <button type="button" data-next="2" class="bg-teal-700 text-white px-6 py-2.5 rounded-lg hover:bg-teal-800">
                مرحلهٔ بعد
              </button>
            </div>
          </section>

          {/* ---- Step 2: problem statement ---- */}
          <section data-step="2" class="bg-white border rounded-2xl p-6 mb-4 hidden">
            <h2 class="font-bold text-gray-900 mb-4">شرح مسئله</h2>

            <label class="block text-sm text-gray-700 mb-1">عنوان کوتاه پرسش</label>
            <input name="rawTitle" type="text" class="w-full border rounded-lg px-3 py-2.5 mb-4" placeholder="مثلاً: فرزندم زمان زیادی صرف بازی می‌کند" />

            <label class="block text-sm text-gray-700 mb-1">دقیقاً چه اتفاقی افتاده است؟ (حداقل ۵۰ کاراکتر)</label>
            <textarea name="rawWhatHappened" rows="5" class="w-full border rounded-lg px-3 py-2.5 mb-4"></textarea>

            <label class="block text-sm text-gray-700 mb-1">از چه زمانی این موضوع مطرح است؟</label>
            <input name="rawSinceWhen" type="text" class="w-full border rounded-lg px-3 py-2.5 mb-4" />

            <label class="block text-sm text-gray-700 mb-1">تا الان چه کاری انجام داده‌اید؟</label>
            <textarea name="rawTriedSoFar" rows="3" class="w-full border rounded-lg px-3 py-2.5 mb-4"></textarea>

            <label class="block text-sm text-gray-700 mb-1">دقیقاً چه کمکی از پرسش‌کده می‌خواهید؟</label>
            <textarea name="rawHelpRequested" rows="3" class="w-full border rounded-lg px-3 py-2.5"></textarea>

            <div class="mt-6 flex justify-between">
              <button type="button" data-prev="1" class="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg hover:border-teal-600">
                مرحلهٔ قبل
              </button>
              <button type="button" data-next="3" class="bg-teal-700 text-white px-6 py-2.5 rounded-lg hover:bg-teal-800">
                مرحلهٔ بعد
              </button>
            </div>
          </section>

          {/* ---- Step 3: privacy/consent + captcha + submit ---- */}
          <section data-step="3" class="bg-white border rounded-2xl p-6 mb-4 hidden">
            <h2 class="font-bold text-gray-900 mb-4">حریم خصوصی و ارسال</h2>

            <div class="mb-4">
              <label class="block text-sm text-gray-700 mb-2">انتخاب انتشار</label>
              <label class="flex items-start gap-2 mb-2 text-sm text-gray-700">
                <input type="radio" name="publicationChoice" value="publish_after_anonymization" checked />
                <span>پس از پالایش هویتی توسط ناظران، پرسشم به‌صورت ناشناس در پرسش‌کده منتشر شود.</span>
              </label>
              <label class="flex items-start gap-2 text-sm text-gray-700">
                <input type="radio" name="publicationChoice" value="private_referral_only" />
                <span>پرسشم فقط به‌صورت خصوصی به یک استاد/کارشناس ارجاع شود و منتشر نشود.</span>
              </label>
            </div>

            <label class="flex items-start gap-2 mb-4 text-sm text-gray-700">
              <input type="checkbox" id="consent-checkbox" required />
              <span>می‌پذیرم که اطلاعات این پرسش پیش از انتشار عمومی، توسط ناظران بازبینی و هویت من حذف می‌شود.</span>
            </label>

            <div class="cf-turnstile mb-4" data-sitekey={siteKey} data-callback="onAskTurnstileSuccess"></div>

            <p id="crisis-triage-note" class="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 hidden">
              با توجه به محتوای پرسش شما، این مورد به‌صورت خصوصی و مستقیم به یک متخصص ارجاع می‌شود و در فهرست عمومی منتشر نخواهد شد.
            </p>

            <div class="flex justify-between">
              <button type="button" data-prev="2" class="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg hover:border-teal-600">
                مرحلهٔ قبل
              </button>
              <button type="submit" id="submit-question-btn" class="bg-teal-700 text-white px-6 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-50" disabled>
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
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <h1 class="text-xl font-bold text-amber-900 mb-3">پرسش شما به‌صورت خصوصی ثبت شد</h1>
          <p class="text-gray-700 mb-4">
            با توجه به محتوای پرسش شما، این موضوع حساس تشخیص داده شد و به‌صورت کاملاً خصوصی و مستقیم برای بررسی به
            یک استاد/کارشناس ارجاع شده است. این پرسش در فهرست عمومی پرسش‌کده منتشر نخواهد شد.
          </p>
          <p class="text-gray-700 mb-6">
            اگر احساس می‌کنید وضعیت فوری و اضطراری است، لطفاً همین حالا با اورژانس اجتماعی (۱۲۳) یا یک متخصص
            روان‌شناسی تماس بگیرید. تیم پرسش‌کده در سریع‌ترین زمان ممکن پاسخ خصوصی شما را پیگیری می‌کند.
          </p>
          <a href="/porseshkadeh" class="text-teal-700 hover:underline text-sm">بازگشت به پرسش‌کده ←</a>
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
    <div class={`border-r-2 border-gray-100 pr-4 ${depth > 0 ? 'mt-4' : ''} ${hiddenClass}`} data-depth={depth}>
      <div class="bg-white border rounded-2xl p-5" id={`response-${node.id}`}>
        <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
          <TierBadge level={node.authorLevelSnapshot} isEditorPick={node.isEditorPick} />
          <span class="text-xs text-gray-400">{new Date(node.createdAt).toLocaleDateString('fa-IR')}</span>
        </div>
        {node.replyToDisplayName && (
          <div class="text-xs text-gray-400 mb-1">در پاسخ به {node.replyToDisplayName}</div>
        )}
        <p class={`text-gray-800 whitespace-pre-line leading-7 ${node.isTombstone ? 'italic text-gray-400' : ''}`}>{node.body}</p>
        {!node.isTombstone && (
          <div class="flex items-center gap-4 mt-3 text-sm">
            <button
              class="vote-btn text-gray-500 hover:text-teal-700 flex items-center gap-1"
              data-response-id={node.id}
            >
              <i class="fas fa-thumbs-up"></i> مفید بود ({node.helpfulVotesCount})
            </button>
            <button class="reply-btn text-gray-500 hover:text-teal-700" data-response-id={node.id} data-display-name={node.authorDisplayName}>
              پاسخ
            </button>
            <button class="report-btn text-gray-500 hover:text-red-600" data-response-id={node.id}>
              گزارش تخلف
            </button>
          </div>
        )}
      </div>

      {node.replies.length > 0 && (
        <div class="mt-2">
          {depth >= maxDepth && (
            <button class="show-more-replies text-teal-700 text-sm hover:underline mb-2" data-target={`replies-of-${node.id}`}>
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
          <h1 class="text-2xl font-bold text-gray-900 mb-2">پرسش پیدا نشد</h1>
          <a href="/porseshkadeh" class="text-teal-700 hover:underline">بازگشت به پرسش‌کده</a>
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
        <nav class="text-sm text-gray-500 mb-4">
          <a href="/porseshkadeh" class="hover:text-teal-700">پرسش‌کده</a>
          {question.categoryNameFa && <span> / {question.categoryNameFa}</span>}
        </nav>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{question.publicTitle}</h1>
        {question.publicBody && (
          <article class="prose prose-neutral max-w-none whitespace-pre-line leading-8 text-gray-800 mb-8">
            {question.publicBody}
          </article>
        )}

        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 class="font-bold text-gray-900">{tree.length} پاسخ</h2>
          <form method="get" class="flex items-center gap-2">
            <label class="text-sm text-gray-600">ترتیب:</label>
            <select name="sort" class="border rounded-lg px-2 py-1.5 text-sm" onchange="this.form.submit()">
              {sortOptions.map((opt) => (
                <option value={opt.value} selected={opt.value === sortMode}>{opt.label}</option>
              ))}
            </select>
          </form>
        </div>

        <div id="response-tree" class="space-y-4 mb-10">
          {tree.length === 0 ? (
            <div class="bg-white border rounded-2xl p-8 text-center text-gray-500 text-sm">
              هنوز پاسخی ثبت نشده است. اولین نفری باشید که پاسخ می‌دهد.
            </div>
          ) : (
            tree.map((node) => <TreeNodeView node={node} depth={0} maxDepth={3} questionSlug={question.slug} />)
          )}
        </div>

        {userId ? (
          <div class="bg-white border rounded-2xl p-6" id="answer-box">
            <h3 class="font-bold text-gray-900 mb-3">پاسخ شما</h3>
            <p id="reply-context" class="text-xs text-teal-700 mb-2 hidden"></p>
            <textarea id="answer-body" rows="4" class="w-full border rounded-lg px-3 py-2.5 mb-3" placeholder="تجربه یا راهنمایی خودتان را بنویسید..."></textarea>
            <label id="as-experience-label" class="flex items-center gap-2 mb-3 text-sm text-gray-700">
              <input type="checkbox" id="as-experience-checkbox" />
              این یک تجربهٔ شخصی من به‌عنوان والد/مربی است.
            </label>
            <div class="flex justify-end gap-2">
              <button id="cancel-reply-btn" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hidden">لغو پاسخ به</button>
              <button id="submit-answer-btn" class="bg-teal-700 text-white px-5 py-2.5 rounded-lg hover:bg-teal-800 text-sm">ارسال</button>
            </div>
            <p id="answer-error" class="text-red-600 text-sm mt-3 hidden"></p>
          </div>
        ) : (
          <div class="bg-white border rounded-2xl p-6 text-center text-sm text-gray-600">
            برای ثبت پاسخ، <a href="/login" class="text-teal-700 hover:underline">وارد شوید</a>.
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
          <h1 class="text-xl font-bold text-gray-900 mb-3">این صفحه فقط برای اساتید و کارشناسان است</h1>
          <p class="text-gray-600">حساب شما دسترسی کارتابل تخصصی ندارد.</p>
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
        <h1 class="text-2xl font-bold text-gray-900 mb-2">کارتابل {profile.credentialType === 'professor' ? 'استاد' : 'کارشناس'}</h1>
        <p class="text-gray-600 mb-8 text-sm">پرسش‌های ارجاع‌شده و پرسش‌های منتشرشده در حوزهٔ تخصص شما.</p>

        <section class="mb-10">
          <h2 class="font-bold text-gray-900 mb-4">پرسش‌های ارجاع‌شده به شما ({assigned.length})</h2>
          {assigned.length === 0 ? (
            <div class="bg-white border rounded-2xl p-6 text-center text-gray-500 text-sm">موردی ارجاع نشده است.</div>
          ) : (
            <div class="grid gap-3">
              {assigned.map((item) => (
                <a href={`/porseshkadeh/cartable/respond/${item.questionId}`} class="block bg-white border rounded-2xl p-5 hover:shadow-md">
                  <div class="font-bold text-gray-900">{item.publicTitle || '(در انتظار بازبینی ناظر)'}</div>
                  <div class="text-xs text-gray-400 mt-1">وضعیت ارجاع: {item.status}</div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 class="font-bold text-gray-900 mb-4">پرسش‌های منتشرشده در حوزهٔ تخصص شما ({inExpertise.total})</h2>
          {inExpertise.items.length === 0 ? (
            <div class="bg-white border rounded-2xl p-6 text-center text-gray-500 text-sm">
              موردی یافت نشد. (اگر انتظار می‌رود موردی باشد، بررسی کنید که حوزه‌های تخصص شما با دسته‌بندی‌های محتوا هم‌نام باشند.)
            </div>
          ) : (
            <div class="grid gap-3">
              {inExpertise.items.map((item) => (
                <a href={`/porseshkadeh/cartable/respond/${item.id}`} class="block bg-white border rounded-2xl p-5 hover:shadow-md">
                  <div class="font-bold text-gray-900">{item.publicTitle}</div>
                  <div class="text-xs text-gray-400 mt-1">{item.responsesCount} پاسخ</div>
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
        <nav class="text-sm text-gray-500 mb-4">
          <a href="/porseshkadeh/cartable" class="hover:text-teal-700">کارتابل</a>
        </nav>
        <h1 class="text-xl font-bold text-gray-900 mb-2">{question.publicTitle || '(در انتظار بازبینی ناظر)'}</h1>
        {question.publicBody && <p class="text-gray-700 whitespace-pre-line leading-7 mb-8">{question.publicBody}</p>}

        <div class="bg-white border rounded-2xl p-6">
          <h2 class="font-bold text-gray-900 mb-4">فرم پاسخ ساختاریافته</h2>
          <input type="hidden" id="cartable-question-id" value={questionId} />
          <input type="hidden" id="cartable-draft-id" value={draft?.id ?? ''} />

          <label class="block text-sm text-gray-700 mb-1">خلاصهٔ مسئله (اختیاری)</label>
          <textarea id="meta-problem-summary" rows="2" class="w-full border rounded-lg px-3 py-2.5 mb-4"></textarea>

          <label class="block text-sm text-gray-700 mb-1">در این وضعیت چه کاری نباید انجام داد؟ (اختیاری)</label>
          <textarea id="meta-what-not-to-do" rows="2" class="w-full border rounded-lg px-3 py-2.5 mb-4"></textarea>

          <label class="block text-sm text-gray-700 mb-1">پاسخ اصلی</label>
          <textarea id="cartable-body" rows="6" class="w-full border rounded-lg px-3 py-2.5 mb-4">{draft?.body || ''}</textarea>

          <div class="flex justify-end gap-2">
            <button id="save-draft-btn" class="bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm hover:border-teal-600">
              ذخیرهٔ پیش‌نویس
            </button>
            <button id="submit-for-review-btn" class="bg-teal-700 text-white px-5 py-2.5 rounded-lg hover:bg-teal-800 text-sm">
              ارسال برای بازبینی
            </button>
          </div>
          <p id="cartable-status" class="text-sm mt-3 text-gray-500"></p>
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
        <h1 class="text-2xl font-bold text-gray-900 mb-6">صف نظارت پرسش‌ها</h1>
        <div class="grid gap-4">
          {items.length === 0 && <div class="bg-white border rounded-2xl p-8 text-center text-gray-500 text-sm">صف خالی است.</div>}
          {items.map((q) => (
            <div class="bg-white border rounded-2xl p-5" data-question-id={q.id}>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs px-2 py-1 rounded-full bg-gray-100">{q.status}</span>
                {q.isFlaggedSensitive && (
                  <span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">پرچم بحران</span>
                )}
              </div>
              <div class="font-bold text-gray-900 mb-1">{q.rawTitle}</div>
              <p class="text-gray-600 text-sm whitespace-pre-line mb-4">{q.rawWhatHappened}</p>
              <div class="flex flex-wrap gap-2 text-sm">
                <button class="mod-question-btn bg-teal-700 text-white px-3 py-1.5 rounded-lg" data-id={q.id} data-action="approve_publish">انتشار</button>
                <button class="mod-question-btn bg-white border px-3 py-1.5 rounded-lg" data-id={q.id} data-action="reject">رد</button>
                <button class="mod-question-btn bg-white border px-3 py-1.5 rounded-lg" data-id={q.id} data-action="crisis_referral">ارجاع بحران</button>
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
        <h1 class="text-2xl font-bold text-gray-900 mb-6">صف نظارت پاسخ‌ها</h1>
        <div class="grid gap-4">
          {items.length === 0 && <div class="bg-white border rounded-2xl p-8 text-center text-gray-500 text-sm">صف خالی است.</div>}
          {items.map((r) => (
            <div class="bg-white border rounded-2xl p-5" data-response-id={r.id}>
              <div class="flex items-center justify-between mb-2">
                <TierBadge level={r.authorLevelSnapshot} isEditorPick={r.isEditorPick} />
                <span class="text-xs px-2 py-1 rounded-full bg-gray-100">{r.status}</span>
              </div>
              <p class="text-gray-700 text-sm whitespace-pre-line mb-4">{r.body}</p>
              <div class="flex flex-wrap gap-2 text-sm">
                <button class="mod-response-btn bg-teal-700 text-white px-3 py-1.5 rounded-lg" data-id={r.id} data-action="approve">تأیید</button>
                <button class="mod-response-btn bg-white border px-3 py-1.5 rounded-lg" data-id={r.id} data-action="hide">پنهان کردن</button>
                <button class="mod-response-btn bg-white border px-3 py-1.5 rounded-lg" data-id={r.id} data-action="delete">حذف (تومبستون)</button>
                <button class="mod-response-btn bg-white border px-3 py-1.5 rounded-lg" data-id={r.id} data-action="editor_pick">منتخب تحریریه</button>
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
        <h1 class="text-2xl font-bold text-gray-900 mb-6">صف گزارش‌های تخلف</h1>
        <div class="grid gap-4">
          {items.length === 0 && <div class="bg-white border rounded-2xl p-8 text-center text-gray-500 text-sm">صف خالی است.</div>}
          {items.map((r) => (
            <div class="bg-white border rounded-2xl p-5" data-report-id={r.id}>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700">{r.reason}</span>
                <span class="text-xs px-2 py-1 rounded-full bg-gray-100">{r.status}</span>
              </div>
              <p class="text-gray-700 text-sm whitespace-pre-line mb-1">پاسخ گزارش‌شده: {r.responseBody}</p>
              {r.note && <p class="text-gray-500 text-xs mb-4">یادداشت گزارش‌دهنده: {r.note}</p>}
              <div class="flex flex-wrap gap-2 text-sm items-center">
                <select class="report-penalty-select border rounded-lg px-2 py-1.5 text-sm" data-id={r.id}>
                  <option value="none">بدون مجازات</option>
                  <option value="delete_comment">حذف پاسخ</option>
                  <option value="warn_user">اخطار به کاربر</option>
                  <option value="suspend_user">تعلیق موقت کاربر</option>
                </select>
                <button class="report-resolve-btn bg-teal-700 text-white px-3 py-1.5 rounded-lg" data-id={r.id} data-status="resolved">رسیدگی شد</button>
                <button class="report-resolve-btn bg-white border px-3 py-1.5 rounded-lg" data-id={r.id} data-status="dismissed">رد گزارش</button>
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
