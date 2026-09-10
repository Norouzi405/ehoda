/**
 * ابزارخانهٔ تعاملی (Interactive Toolkit House, spec §11) — server-rendered
 * wizard pages (D-004: Hono JSX SSR, no SPA). These render the fixed
 * question/axis definitions from src/services/tool.service.ts and post to
 * the SAME JSON API in src/routes/tools.api.ts (never duplicate business
 * logic). Progressive-enhancement JS lives in
 * public/static/tools-wizard.js (shared by all 3 wizards).
 *
 * Mandatory requirements (client directive, Phase 3):
 *   - RTL step-based form with progress bar            -> see ProgressBar/StepIndicator below
 *   - storage in tool_submissions (private, user-linked) -> handled by ToolService, ownership-gated
 *   - in-browser text preview before download           -> #tool-wizard-preview, rendered client-side
 *   - "Download PDF" button per tool                    -> #tool-wizard-download-pdf-btn
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { CURRENT_USER_ID_KEY } from '../middleware/rbac'
import { SiteHeader, SiteFooter } from '../components/layout'
import {
  DEVICE_OPTIONS,
  SENSITIVE_SITUATIONS,
  PHONE_READINESS_AXES,
  MEDIA_STYLE_AXES,
} from '../services/tool.service'
import type { FC } from 'hono/jsx'

export const toolsPagesRoute = new Hono<{ Bindings: Bindings }>()

const fieldLabel = 'block text-sm font-bold text-stone-600 mb-1.5'
const fieldInput =
  'w-full border border-stone-200 rounded-xl px-3 py-2.5 mb-4 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors'

// ------------------------- Shared building blocks -------------------------

const ProgressBar: FC = () => (
  <div class="h-1.5 bg-stone-100 rounded-full mb-6 overflow-hidden">
    <div id="tool-wizard-progress-bar" class="h-full bg-teal-800 transition-all" style="width: 33%"></div>
  </div>
)

const StepIndicators: FC<{ steps: string[] }> = ({ steps }) => (
  <div class="flex items-center gap-2 mb-4 text-sm flex-wrap">
    {steps.map((label, i) => (
      <span
        data-step-indicator={String(i + 1)}
        class={`flex-1 min-w-[90px] text-center py-2 rounded-full font-bold transition-colors ${i === 0 ? 'bg-teal-800 text-white' : 'bg-stone-100 text-stone-400'}`}
      >
        {`${i + 1}. ${label}`}
      </span>
    ))}
  </div>
)

const LikertQuestion: FC<{ questionKey: string; labelFa: string }> = ({ questionKey, labelFa }) => (
  <div class="mb-5 p-4 rounded-xl border border-stone-200 bg-stone-50/40" data-likert={questionKey} required>
    <p class="text-sm text-stone-700 mb-2">{labelFa}</p>
    <div class="flex items-center justify-between gap-1 text-xs text-stone-400">
      <span>کاملاً مخالفم</span>
      <div class="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <label class="flex flex-col items-center gap-1 cursor-pointer">
            <input type="radio" name={questionKey} value={String(v)} class="accent-teal-800 w-4 h-4" />
            <span>{v}</span>
          </label>
        ))}
      </div>
      <span>کاملاً موافقم</span>
    </div>
  </div>
)

const LoginRequiredNotice: FC<{ title: string; body: string }> = ({ title, body }) => (
  <div class="max-w-md mx-auto px-4 md:px-6 py-16 text-center">
    <div class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-8">
      <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-lock text-lg"></i>
      </div>
      <h1 class="font-display text-xl font-extrabold text-stone-800 mb-3">{title}</h1>
      <p class="text-stone-500 text-sm mb-6">{body}</p>
      <a href="/login" class="bg-teal-800 text-white px-6 py-3 rounded-full font-bold hover:bg-teal-900 inline-block transition-colors">
        ورود / ثبت‌نام
      </a>
    </div>
  </div>
)

/** Shared "preview + PDF download" block, appended after the form in every wizard. */
const PreviewAndDownload: FC = () => (
  <div id="tool-wizard-preview-wrap" class="hidden bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mt-4">
    <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
      <i class="fas fa-eye text-teal-800"></i>
      پیش‌نمایش نتیجه
    </h2>
    <p id="tool-wizard-saved-note" class="hidden text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-xl p-3 mb-4"></p>
    <div id="tool-wizard-preview" class="hidden text-sm text-stone-700 leading-7 mb-4"></div>
    <button
      type="button"
      id="tool-wizard-download-pdf-btn"
      class="hidden bg-amber-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-amber-700 transition-colors"
    >
      <i class="fas fa-file-pdf ms-1"></i>
      دانلود PDF
    </button>
  </div>
)

const WizardShell: FC<{
  toolSlug: string
  totalSteps: number
  title: string
  description: string
  isAuthenticated: boolean
  children: any
}> = ({ toolSlug, totalSteps, title, description, isAuthenticated, children }) => (
  <div dir="rtl">
    <SiteHeader />
    <main class="max-w-2xl mx-auto px-4 md:px-6 py-10">
      <h1 class="font-display text-2xl font-extrabold text-stone-800 mb-2">{title}</h1>
      <p class="text-stone-500 mb-6 text-sm">{description}</p>
      {!isAuthenticated && (
        <p class="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
          <i class="fas fa-info-circle ms-1"></i>
          می‌توانید بدون ورود این ابزار را به‌صورت پیش‌نمایش تجربه کنید، اما برای ذخیرهٔ نتیجه و دریافت PDF باید{' '}
          <a href="/login" class="underline font-bold">
            وارد حساب خود شوید
          </a>
          .
        </p>
      )}
      <div id="tool-wizard-root" data-tool-slug={toolSlug} data-total-steps={String(totalSteps)} data-authenticated={isAuthenticated ? '1' : '0'}>
        <ProgressBar />
        {children}
        <p id="tool-wizard-error" class="text-red-600 text-sm mt-3 hidden"></p>
        <PreviewAndDownload />
      </div>
    </main>
    <SiteFooter />
    <script src="/static/tools-wizard.js"></script>
  </div>
)

// ==========================================================================
// 1. /tools/family-agreement
// ==========================================================================

toolsPagesRoute.get('/tools/family-agreement', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  const isAuthenticated = Boolean(userId)

  return c.render(
    <WizardShell
      toolSlug="family_media_contract"
      totalSteps={3}
      title="قرارداد رسانه‌ای خانواده"
      description="یک توافق‌نامهٔ شخصی‌سازی‌شده برای استفاده از رسانه در خانواده بسازید — با مشارکت همهٔ اعضا و بازبینی ماهانه."
      isAuthenticated={isAuthenticated}
    >
      <StepIndicators steps={['اعضا و دستگاه‌ها', 'موقعیت‌های حساس و تعهدها', 'بازبینی و ارسال']} />
      <form id="tool-wizard-form">
        {/* ---- Step 1: family members + devices ---- */}
        <section data-step="1" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4">
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-people-roof text-teal-800"></i>
            اعضای خانواده و دستگاه‌ها
          </h2>

          <label class={fieldLabel}>اعضای خانواده</label>
          <div id="family-member-list" class="space-y-2 mb-3"></div>
          <template id="family-member-row-template">
            <div data-member-row class="flex items-center gap-2">
              <input data-field="name" type="text" placeholder="نام عضو خانواده" class="flex-1 border border-stone-200 rounded-xl px-3 py-2 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30" />
              <select data-field="role" class="border border-stone-200 rounded-xl px-3 py-2 bg-stone-50/50">
                <option value="parent">والد</option>
                <option value="child">فرزند</option>
              </select>
              <button type="button" data-remove-row class="text-stone-400 hover:text-red-600 px-2">
                <i class="fas fa-xmark"></i>
              </button>
            </div>
          </template>
          <button type="button" id="add-family-member-btn" class="text-teal-800 text-sm font-bold hover:text-teal-900 mb-4">
            <i class="fas fa-plus ms-1"></i>
            افزودن عضو
          </button>

          <label class={fieldLabel}>دستگاه‌های تحت پوشش این توافق</label>
          <div class="flex flex-wrap gap-2 mb-4">
            {DEVICE_OPTIONS.map((d) => (
              <label class="flex items-center gap-1.5 text-sm text-stone-600 border border-stone-200 rounded-full px-3 py-1.5 cursor-pointer hover:border-teal-700">
                <input type="checkbox" name="devices" value={d.key} class="accent-teal-800" />
                {d.labelFa}
              </label>
            ))}
          </div>

          <div class="mt-6 flex justify-end">
            <button type="button" data-next="2" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
              مرحلهٔ بعد
            </button>
          </div>
        </section>

        {/* ---- Step 2: sensitive situations + commitments ---- */}
        <section data-step="2" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 hidden">
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-triangle-exclamation text-teal-800"></i>
            موقعیت‌های حساس و تعهدها
          </h2>

          <label class={fieldLabel}>موقعیت‌های حساسی که در خانواده ممکن است رخ دهد</label>
          <div class="flex flex-wrap gap-2 mb-4">
            {SENSITIVE_SITUATIONS.map((s) => (
              <label class="flex items-center gap-1.5 text-sm text-stone-600 border border-stone-200 rounded-full px-3 py-1.5 cursor-pointer hover:border-teal-700">
                <input type="checkbox" name="sensitiveSituations" value={s.key} class="accent-teal-800" />
                {s.labelFa}
              </label>
            ))}
          </div>

          <label class={fieldLabel}>تعهدهای والدین (هر مورد در یک سطر)</label>
          <textarea name="parentCommitmentsText" rows="3" class={fieldInput} placeholder={'مثلاً: در زمان غذا، گوشی کنار گذاشته می‌شود.'}></textarea>

          <label class={fieldLabel}>تعهدهای فرزند (هر مورد در یک سطر)</label>
          <textarea name="childCommitmentsText" rows="3" class="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors" placeholder={'مثلاً: قبل از دوستی با افراد ناشناس اطلاع می‌دهم.'}></textarea>

          <div class="mt-6 flex justify-between">
            <button type="button" data-prev="1" class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
              مرحلهٔ قبل
            </button>
            <button type="button" data-next="3" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
              مرحلهٔ بعد
            </button>
          </div>
        </section>

        {/* ---- Step 3: monthly review date + submit ---- */}
        <section data-step="3" class="bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 hidden">
          <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
            <i class="fas fa-calendar-check text-teal-800"></i>
            تاریخ بازبینی ماهانه
          </h2>

          <label class={fieldLabel}>تاریخ نخستین بازبینی این توافق</label>
          <input name="reviewDate" type="date" class="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-teal-700/30 focus:border-teal-700 focus:bg-white transition-colors" required />

          <p class="text-stone-500 text-sm mt-4 mb-6">
            پس از ارسال، خلاصهٔ توافق را در همین صفحه پیش‌نمایش می‌بینید و در صورت ورود به حساب، می‌توانید نسخهٔ PDF آن را دانلود کنید.
          </p>

          <div class="flex justify-between">
            <button type="button" data-prev="2" class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
              مرحلهٔ قبل
            </button>
            <button type="submit" id="tool-wizard-submit-btn" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
              ثبت توافق‌نامه
            </button>
          </div>
        </section>
      </form>
    </WizardShell>,
    { title: 'قرارداد رسانه‌ای خانواده' },
  )
})

// ==========================================================================
// 2. /tools/phone-readiness
// ==========================================================================

toolsPagesRoute.get('/tools/phone-readiness', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  const isAuthenticated = Boolean(userId)

  return c.render(
    <WizardShell
      toolSlug="phone_readiness_checklist"
      totalSteps={PHONE_READINESS_AXES.length}
      title="چک‌لیست آمادگی دریافت گوشی شخصی"
      description="ارزیابی چندبعدی آمادگی فرزند شما برای دریافت گوشی شخصی — بر اساس بلوغ رفتاری، نیاز واقعی، سابقهٔ رفتاری و مدیریت زمان."
      isAuthenticated={isAuthenticated}
    >
      <StepIndicators steps={PHONE_READINESS_AXES.map((a) => a.labelFa)} />
      <form id="tool-wizard-form">
        {PHONE_READINESS_AXES.map((axis, i) => (
          <section data-step={String(i + 1)} class={`bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 ${i === 0 ? '' : 'hidden'}`}>
            <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
              <i class="fas fa-check-double text-teal-800"></i>
              {axis.labelFa}
            </h2>
            {axis.questions.map((q) => (
              <LikertQuestion questionKey={q.key} labelFa={q.labelFa} />
            ))}
            <div class="mt-6 flex justify-between">
              {i > 0 ? (
                <button type="button" data-prev={String(i)} class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
                  مرحلهٔ قبل
                </button>
              ) : (
                <span></span>
              )}
              {i < PHONE_READINESS_AXES.length - 1 ? (
                <button type="button" data-next={String(i + 2)} class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                  مرحلهٔ بعد
                </button>
              ) : (
                <button type="submit" id="tool-wizard-submit-btn" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                  مشاهدهٔ نتیجه
                </button>
              )}
            </div>
          </section>
        ))}
      </form>
    </WizardShell>,
    { title: 'چک‌لیست آمادگی دریافت گوشی شخصی' },
  )
})

// ==========================================================================
// 3. /tools/media-style-quiz
// ==========================================================================

toolsPagesRoute.get('/tools/media-style-quiz', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  const isAuthenticated = Boolean(userId)

  return c.render(
    <WizardShell
      toolSlug="media_style_quiz"
      totalSteps={MEDIA_STYLE_AXES.length}
      title="آزمون سبک رسانه‌ای خانواده"
      description="نقاط قوت و حوزه‌های نیازمند توجه در سبک رسانه‌ای خانوادهٔ خود را شناسایی کنید و یک برنامهٔ عملی ۷ روزه دریافت کنید."
      isAuthenticated={isAuthenticated}
    >
      <StepIndicators steps={MEDIA_STYLE_AXES.map((a) => a.labelFa)} />
      <form id="tool-wizard-form">
        {MEDIA_STYLE_AXES.map((axis, i) => (
          <section data-step={String(i + 1)} class={`bg-white rounded-2xl border border-stone-200/70 shadow-sm p-6 mb-4 ${i === 0 ? '' : 'hidden'}`}>
            <h2 class="font-extrabold text-stone-800 mb-4 flex items-center gap-2">
              <i class="fas fa-chart-simple text-teal-800"></i>
              {axis.labelFa}
            </h2>
            {axis.questions.map((q) => (
              <LikertQuestion questionKey={q.key} labelFa={q.labelFa} />
            ))}
            <div class="mt-6 flex justify-between">
              {i > 0 ? (
                <button type="button" data-prev={String(i)} class="bg-white border border-stone-200 text-stone-600 px-6 py-2.5 rounded-full font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">
                  مرحلهٔ قبل
                </button>
              ) : (
                <span></span>
              )}
              {i < MEDIA_STYLE_AXES.length - 1 ? (
                <button type="button" data-next={String(i + 2)} class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                  مرحلهٔ بعد
                </button>
              ) : (
                <button type="submit" id="tool-wizard-submit-btn" class="bg-teal-800 text-white px-6 py-2.5 rounded-full font-bold hover:bg-teal-900 transition-colors">
                  مشاهدهٔ نتیجه
                </button>
              )}
            </div>
          </section>
        ))}
      </form>
    </WizardShell>,
    { title: 'آزمون سبک رسانه‌ای خانواده' },
  )
})
