/**
 * Service layer (portability rule 3.1): pure business logic for the
 * Interactive Toolkit House (spec §11) — zero framework/Cloudflare
 * imports. Three tools:
 *
 *   1. family_media_contract     -> `/tools/family-agreement`
 *   2. phone_readiness_checklist -> `/tools/phone-readiness`
 *   3. media_style_quiz          -> `/tools/media-style-quiz`
 *
 * Each tool exposes:
 *   - a fixed question/axis definition (single source of truth, imported
 *     by BOTH the SSR wizard page for rendering and the route for
 *     validating submitted answer keys),
 *   - a pure `computeXxxResult()` function (scoring / verdict / plan —
 *     easily unit-tested with plain objects, no repository needed), and
 *   - orchestration methods on `ToolService` that persist the submission
 *     (when a userId is present; anonymous preview never persists,
 *     spec §11: "Auth required for saving + PDF; anonymous preview
 *     allowed without saving").
 *
 * Ownership rule (mandatory requirement, private/user-linked storage):
 * `getOwnedSubmission` is the ONLY way a route should fetch a submission
 * before showing/serving it — it enforces `submission.userId === requesterId`
 * unless `isAdminOverride` is true, mirroring the ownership/permission gate
 * pattern used for `question.repository.ts`'s raw/private DTOs.
 */
import type { ToolRepository, ToolRecord, ToolSubmissionRecord } from '../repositories/tool.repository'

// ==========================================================================
// 1. Family Media Agreement (family_media_contract)
// ==========================================================================

export interface FamilyMemberInput {
  name: string
  role: 'parent' | 'child'
  ageGroupSlug?: string
}

export interface FamilyAgreementInput {
  familyMembers: FamilyMemberInput[]
  devices: string[] // e.g. 'mobile' | 'tablet' | 'tv' | 'console' | 'laptop'
  sensitiveSituations: string[] // fixed catalogue keys, see SENSITIVE_SITUATIONS below
  parentCommitments: string[]
  childCommitments: string[]
  reviewDate: string // ISO date (YYYY-MM-DD), monthly review
}

export interface FamilyAgreementResult {
  familyMembers: FamilyMemberInput[]
  devices: string[]
  sensitiveSituationLabels: string[]
  parentCommitments: string[]
  childCommitments: string[]
  reviewDate: string
  summaryFa: string
}

export const DEVICE_OPTIONS: { key: string; labelFa: string }[] = [
  { key: 'mobile', labelFa: 'گوشی هوشمند' },
  { key: 'tablet', labelFa: 'تبلت' },
  { key: 'tv', labelFa: 'تلویزیون هوشمند' },
  { key: 'console', labelFa: 'کنسول بازی' },
  { key: 'laptop', labelFa: 'لپ‌تاپ/کامپیوتر' },
  { key: 'smartwatch', labelFa: 'ساعت هوشمند' },
]

export const SENSITIVE_SITUATIONS: { key: string; labelFa: string }[] = [
  { key: 'bedtime_screens', labelFa: 'استفاده از صفحه‌نمایش پیش از خواب' },
  { key: 'stranger_contact', labelFa: 'ارتباط با افراد ناشناس در فضای مجازی' },
  { key: 'in_app_purchases', labelFa: 'خریدهای درون‌برنامه‌ای بدون اجازه' },
  { key: 'inappropriate_content', labelFa: 'مواجهه با محتوای نامناسب' },
  { key: 'screen_time_conflict', labelFa: 'اختلاف بر سر مدت‌زمان استفاده از صفحه' },
  { key: 'social_media_pressure', labelFa: 'فشار اجتماعی شبکه‌های اجتماعی' },
  { key: 'family_time_screens', labelFa: 'استفاده از موبایل در زمان دورهمی خانواده' },
]

function labelFor(list: { key: string; labelFa: string }[], key: string): string {
  return list.find((i) => i.key === key)?.labelFa ?? key
}

export function computeFamilyAgreementResult(input: FamilyAgreementInput): FamilyAgreementResult {
  const sensitiveSituationLabels = input.sensitiveSituations.map((k) => labelFor(SENSITIVE_SITUATIONS, k))
  const memberNames = input.familyMembers.map((m) => m.name).filter(Boolean).join('، ')

  const summaryFa = `این توافق‌نامه با مشارکت ${input.familyMembers.length} عضو خانواده${
    memberNames ? ` (${memberNames})` : ''
  } تنظیم شده و هر ماه، در تاریخ مشخص‌شده، بازبینی و در صورت نیاز به‌روزرسانی می‌شود.`

  return {
    familyMembers: input.familyMembers,
    devices: input.devices,
    sensitiveSituationLabels,
    parentCommitments: input.parentCommitments,
    childCommitments: input.childCommitments,
    reviewDate: input.reviewDate,
    summaryFa,
  }
}

// ==========================================================================
// 2. Personal Phone Readiness Checklist (phone_readiness_checklist)
// ==========================================================================

export type PhoneReadinessAxis = 'behavioralMaturity' | 'realNeed' | 'trackRecord' | 'timeManagement'

export const PHONE_READINESS_AXES: { key: PhoneReadinessAxis; labelFa: string; questions: { key: string; labelFa: string }[] }[] = [
  {
    key: 'behavioralMaturity',
    labelFa: 'بلوغ رفتاری',
    questions: [
      { key: 'keeps_promises', labelFa: 'به قول‌ها و زمان‌بندی‌های تعیین‌شده پایبند است.' },
      { key: 'handles_disappointment', labelFa: 'در برابر «نه» شنیدن یا محدودیت، واکنش متناسب دارد.' },
      { key: 'follows_home_rules', labelFa: 'قوانین موجود خانه را (بدون گوشی) به‌طور معمول رعایت می‌کند.' },
    ],
  },
  {
    key: 'realNeed',
    labelFa: 'نیاز واقعی',
    questions: [
      { key: 'school_communication_need', labelFa: 'برای ارتباط با مدرسه/رفت‌وآمد به گوشی نیاز واقعی دارد.' },
      { key: 'safety_need', labelFa: 'موقعیت‌های ایمنی (تنها بودن، مسیر رفت‌وآمد) نیاز به گوشی را توجیه می‌کند.' },
      { key: 'social_need', labelFa: 'نیاز اجتماعی او فراتر از «همه دوستانش دارند» است.' },
    ],
  },
  {
    key: 'trackRecord',
    labelFa: 'سابقهٔ رفتاری',
    questions: [
      { key: 'screen_time_history', labelFa: 'در استفاده از تبلت/کنسول تا امروز، زمان‌بندی را رعایت کرده است.' },
      { key: 'device_care_history', labelFa: 'در نگهداری از وسایل و امانت‌داری، سابقهٔ خوبی دارد.' },
      { key: 'honesty_history', labelFa: 'در گفتن حقیقت دربارهٔ فعالیت‌های آنلاین صادق بوده است.' },
    ],
  },
  {
    key: 'timeManagement',
    labelFa: 'مدیریت زمان',
    questions: [
      { key: 'homework_priority', labelFa: 'تکالیف و مسئولیت‌ها را پیش از تفریح انجام می‌دهد.' },
      { key: 'sleep_schedule', labelFa: 'برنامهٔ خواب منظمی دارد که مختل نمی‌شود.' },
      { key: 'self_regulation', labelFa: 'می‌تواند خودش زمان بازی/تفریح را قطع کند.' },
    ],
  },
]

export type PhoneReadinessAnswers = Record<string, number> // question key -> 1..5

export type PhoneReadinessVerdict = 'ready' | 'conditionally_ready' | 'needs_more_practice'

export const PHONE_READINESS_VERDICT_LABEL: Record<PhoneReadinessVerdict, string> = {
  ready: 'آماده',
  conditionally_ready: 'آماده مشروط',
  needs_more_practice: 'نیاز به تمرین بیشتر',
}

export interface PhoneReadinessResult {
  axisScores: Record<PhoneReadinessAxis, number> // 1..5 average per axis
  overallScore: number
  verdict: PhoneReadinessVerdict
  verdictLabelFa: string
  recommendationsFa: string[]
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Clamp a raw Likert answer defensively to the valid 1..5 range. */
function clampLikert(v: number | undefined): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return 1
  return Math.min(5, Math.max(1, v))
}

export function computePhoneReadinessResult(answers: PhoneReadinessAnswers): PhoneReadinessResult {
  const axisScores = {} as Record<PhoneReadinessAxis, number>
  for (const axis of PHONE_READINESS_AXES) {
    const values = axis.questions.map((q) => clampLikert(answers[q.key]))
    axisScores[axis.key] = Math.round(average(values) * 100) / 100
  }

  const overallScore = Math.round(average(Object.values(axisScores)) * 100) / 100

  // Verdict thresholds.
  let verdict: PhoneReadinessVerdict
  if (overallScore >= 4.2) verdict = 'ready'
  else if (overallScore >= 3) verdict = 'conditionally_ready'
  else verdict = 'needs_more_practice'

  // Forcing rule (mirrors the Crisis Triage Filter override pattern in
  // question.service.ts): a very weak track record overrides an
  // otherwise-good overall score — trust is earned through history, not
  // averaged away by other axes.
  if (axisScores.trackRecord < 2 && verdict !== 'needs_more_practice') {
    verdict = 'needs_more_practice'
  }
  // A real need below "developing" caps readiness at "conditional" — a
  // phone should solve a real problem, not just be given regardless.
  if (axisScores.realNeed < 2.5 && verdict === 'ready') {
    verdict = 'conditionally_ready'
  }

  const recommendationsFa: string[] = []
  if (axisScores.behavioralMaturity < 3) recommendationsFa.push('روی پایبندی به قول‌ها و پذیرش محدودیت‌های کوچک در خانه تمرین کنید.')
  if (axisScores.realNeed < 3) recommendationsFa.push('نیاز واقعی به گوشی را با مثال‌های ملموس (نه فقط «همه دارند») بررسی کنید.')
  if (axisScores.trackRecord < 3) recommendationsFa.push('پیش از گوشی، با یک وسیلهٔ کم‌ریسک‌تر (تبلت خانگی) سابقهٔ مثبت بسازید.')
  if (axisScores.timeManagement < 3) recommendationsFa.push('یک برنامهٔ زمانی ساده برای تکالیف/خواب/تفریح تعیین و چند هفته تمرین کنید.')
  if (!recommendationsFa.length) recommendationsFa.push('در همهٔ محورها آمادگی خوبی دیده می‌شود؛ در ابتدا با قوانین ساده و شفاف شروع کنید.')

  return {
    axisScores,
    overallScore,
    verdict,
    verdictLabelFa: PHONE_READINESS_VERDICT_LABEL[verdict],
    recommendationsFa,
  }
}

// ==========================================================================
// 3. Family Media Style Quiz (media_style_quiz)
// ==========================================================================

export type MediaStyleAxis = 'rulesBoundaries' | 'modeling' | 'communication' | 'monitoring' | 'emotionalSupport'

export const MEDIA_STYLE_AXES: { key: MediaStyleAxis; labelFa: string; questions: { key: string; labelFa: string }[] }[] = [
  {
    key: 'rulesBoundaries',
    labelFa: 'قوانین و مرزبندی',
    questions: [
      { key: 'clear_time_limits', labelFa: 'قوانین زمانی مشخص و ثابتی برای استفاده از رسانه در خانه داریم.' },
      { key: 'consistent_enforcement', labelFa: 'این قوانین را به‌طور معمول و بدون استثنای زیاد اجرا می‌کنیم.' },
      { key: 'device_free_zones', labelFa: 'مکان‌ها یا زمان‌های مشخصی (مثل سر میز غذا) بدون دستگاه هستند.' },
    ],
  },
  {
    key: 'modeling',
    labelFa: 'الگوسازی والدین',
    questions: [
      { key: 'own_screen_time', labelFa: 'خودم/همسرم زمان استفاده از گوشی را در حضور فرزندان مدیریت می‌کنیم.' },
      { key: 'model_offline_activities', labelFa: 'فعالیت‌های بدون صفحه (کتاب، بازی، پیاده‌روی) را خودمان هم انجام می‌دهیم.' },
      { key: 'admit_mistakes', labelFa: 'وقتی خودمان زیاده‌روی می‌کنیم، آن را می‌پذیریم و اصلاح می‌کنیم.' },
    ],
  },
  {
    key: 'communication',
    labelFa: 'گفت‌وگو و ارتباط',
    questions: [
      { key: 'open_dialogue', labelFa: 'دربارهٔ محتوایی که فرزندم می‌بیند، بدون قضاوت گفت‌وگو می‌کنم.' },
      { key: 'ask_about_online_life', labelFa: 'از دنیای آنلاین و دوستان مجازی فرزندم باخبرم.' },
      { key: 'child_comfortable_sharing', labelFa: 'فرزندم در صورت مواجهه با مشکل آنلاین، راحت با من در میان می‌گذارد.' },
    ],
  },
  {
    key: 'monitoring',
    labelFa: 'نظارت و آگاهی',
    questions: [
      { key: 'know_apps_used', labelFa: 'می‌دانم فرزندم چه اپلیکیشن‌ها و بازی‌هایی استفاده می‌کند.' },
      { key: 'age_appropriate_content', labelFa: 'محتوایی که در دسترس فرزندم است را متناسب با سنش بررسی می‌کنم.' },
      { key: 'periodic_check_in', labelFa: 'به‌طور دوره‌ای وضعیت استفاده از رسانه را با فرزندم بازبینی می‌کنم.' },
    ],
  },
  {
    key: 'emotionalSupport',
    labelFa: 'حمایت عاطفی',
    questions: [
      { key: 'validate_feelings', labelFa: 'وقتی فرزندم از محدودیت‌های رسانه ناراحت می‌شود، احساسش را می‌پذیرم.' },
      { key: 'alternative_activities', labelFa: 'به‌جای فقط محدود کردن، فعالیت جایگزین جذاب پیشنهاد می‌دهم.' },
      { key: 'calm_conflict_resolution', labelFa: 'اختلاف‌های مربوط به رسانه را با آرامش و بدون فریاد حل می‌کنیم.' },
    ],
  },
]

export type MediaStyleAnswers = Record<string, number> // question key -> 1..5

export interface MediaStyleAxisScore {
  axis: MediaStyleAxis
  labelFa: string
  score: number
  classification: 'strength' | 'developing' | 'challenge'
}

export interface MediaStyleResult {
  axisScores: MediaStyleAxisScore[]
  strengthsFa: string[]
  challengesFa: string[]
  sevenDayPlan: { day: number; titleFa: string; actionFa: string }[]
}

/** Practice-tip pool per axis, used to build the 7-day plan (weakest axis first). */
const PRACTICE_TIPS: Record<MediaStyleAxis, string[]> = {
  rulesBoundaries: [
    'با فرزندتان یک قانون زمانی ساده (مثلاً حداکثر یک ساعت) برای امروز مشخص کنید.',
    'یک «منطقهٔ بدون دستگاه» در خانه (مثل سر میز غذا) تعیین کنید.',
    'قانون دیروز را بدون استثنا، اما با آرامش، اجرا کنید.',
    'قوانین رسانه‌ای خانه را روی کاغذ بنویسید و در جای دیدنی نصب کنید.',
    'از فرزندتان بپرسید نظرش دربارهٔ قانون فعلی چیست و در تنظیم آن مشارکت دهید.',
    'یک زمان مشخص برای «خاموش‌کردن» صفحه‌ها پیش از خواب تعیین کنید.',
    'در پایان هفته، با فرزندتان دربارهٔ رعایت قانون بازخورد مثبت بدهید.',
  ],
  modeling: [
    'امروز یک ساعت را بدون چک‌کردن گوشی، در کنار فرزندتان بگذرانید.',
    'یک فعالیت بدون صفحه (کتاب، بازی فکری) را خودتان شروع کنید و او را دعوت کنید.',
    'اگر امروز زیاده‌روی کردید، صادقانه به فرزندتان بگویید و اصلاح کنید.',
    'گوشی خود را در زمان غذا کنار بگذارید و این را به فرزندتان نشان دهید.',
    'دربارهٔ یک محتوای مفیدی که دیده‌اید با فرزندتان صحبت کنید.',
    'یک پیاده‌روی یا بازی بیرون از خانه بدون گوشی برنامه‌ریزی کنید.',
    'از فرزندتان بخواهید رفتار رسانه‌ای شما را نمره بدهد و بازخورد بگیرید.',
  ],
  communication: [
    'امروز بدون قضاوت از فرزندتان بپرسید امروز چه چیزی آنلاین دیده است.',
    'دربارهٔ یکی از بازی‌ها یا اپلیکیشن‌های مورد علاقه‌اش با او گفت‌وگو کنید.',
    'به او بگویید هر زمان چیز نگران‌کننده‌ای دید، می‌تواند با شما در میان بگذارد.',
    'یک گفت‌وگوی کوتاه دربارهٔ «دوستان مجازی» او داشته باشید.',
    'اگر واکنش تندی نشان دادید، امروز عذرخواهی و گفت‌وگوی آرام‌تری را تجربه کنید.',
    'دربارهٔ تجربهٔ خودتان در نوجوانی با رسانه‌های آن زمان صحبت کنید.',
    'در پایان هفته یک گفت‌وگوی خانوادگی کوتاه دربارهٔ رسانه ترتیب دهید.',
  ],
  monitoring: [
    'فهرست اپلیکیشن‌ها/بازی‌های نصب‌شده روی دستگاه فرزندتان را مرور کنید.',
    'رتبه‌بندی سنی یکی از بازی‌ها یا برنامه‌های پرکاربرد او را بررسی کنید.',
    'تنظیمات حریم خصوصی یکی از شبکه‌های اجتماعی مورد استفادهٔ او را با هم بررسی کنید.',
    'دربارهٔ محتوای یک ویدیو یا صفحه‌ای که امروز دیده، سؤال کنید.',
    'یک بازبینی دوره‌ای (مثلاً هفتگی) برای وضعیت رسانه‌ای فرزندتان تعیین کنید.',
    'با فرزندتان دربارهٔ افراد ناشناسی که ممکن است پیام بدهند صحبت کنید.',
    'نتیجهٔ بازبینی امروز را یادداشت کنید تا هفتهٔ بعد مقایسه کنید.',
  ],
  emotionalSupport: [
    'وقتی امروز فرزندتان از محدودیت ناراحت شد، ابتدا احساسش را تأیید کنید، بعد توضیح دهید.',
    'به‌جای فقط «نه»، یک فعالیت جایگزین جذاب پیشنهاد دهید.',
    'اگر بحثی بر سر گوشی/تبلت شد، امروز آن را با آرامش و بدون فریاد حل کنید.',
    'از فرزندتان بپرسید استفاده از فلان اپلیکیشن چه حسی به او می‌دهد.',
    'یک لحظهٔ کوچک قدردانی برای رعایت قانون رسانه‌ای امروز داشته باشید.',
    'دربارهٔ فشار اجتماعی شبکه‌های اجتماعی با فرزندتان همدلانه گفت‌وگو کنید.',
    'در پایان هفته با فرزندتان دربارهٔ حسش نسبت به قوانین جدید صحبت کنید.',
  ],
}

const AXIS_LABEL_LOOKUP: Record<MediaStyleAxis, string> = MEDIA_STYLE_AXES.reduce(
  (acc, a) => ({ ...acc, [a.key]: a.labelFa }),
  {} as Record<MediaStyleAxis, string>,
)

export function computeMediaStyleResult(answers: MediaStyleAnswers): MediaStyleResult {
  const axisScores: MediaStyleAxisScore[] = MEDIA_STYLE_AXES.map((axis) => {
    const values = axis.questions.map((q) => clampLikert(answers[q.key]))
    const score = Math.round(average(values) * 100) / 100
    const classification: 'strength' | 'developing' | 'challenge' = score >= 4 ? 'strength' : score < 3 ? 'challenge' : 'developing'
    return { axis: axis.key, labelFa: axis.labelFa, score, classification }
  })

  const strengthsFa = axisScores.filter((a) => a.classification === 'strength').map((a) => a.labelFa)
  const challengesFa = axisScores.filter((a) => a.classification === 'challenge').map((a) => a.labelFa)

  // Weakest axes first (ascending score) drive the 7-day plan.
  const weakestFirst = [...axisScores].sort((a, b) => a.score - b.score)
  const sevenDayPlan: { day: number; titleFa: string; actionFa: string }[] = []
  let axisIdx = 0
  let tipIdx = 0
  while (sevenDayPlan.length < 7 && axisIdx < weakestFirst.length) {
    const axis = weakestFirst[axisIdx]
    const tips = PRACTICE_TIPS[axis.axis]
    if (tipIdx < tips.length) {
      sevenDayPlan.push({
        day: sevenDayPlan.length + 1,
        titleFa: AXIS_LABEL_LOOKUP[axis.axis],
        actionFa: tips[tipIdx],
      })
    }
    // Rotate through axes so the plan isn't 7 days of the single weakest
    // axis when there are multiple weak areas; restart tipIdx per axis.
    axisIdx++
    if (axisIdx >= weakestFirst.length) {
      axisIdx = 0
      tipIdx++
    }
  }

  return { axisScores, strengthsFa, challengesFa, sevenDayPlan }
}

// ==========================================================================
// Orchestration: ToolService (submission persistence + ownership)
// ==========================================================================

export interface SubmitResult<TResult> {
  submissionId: number | null // null for anonymous, unsaved preview
  result: TResult
}

export interface ToolService {
  getToolBySlug(slug: string): Promise<ToolRecord | null>
  getToolById(id: number): Promise<ToolRecord | null>
  listActiveTools(): Promise<ToolRecord[]>

  submitFamilyAgreement(input: FamilyAgreementInput, userId: number | null): Promise<SubmitResult<FamilyAgreementResult>>
  submitPhoneReadiness(answers: PhoneReadinessAnswers, userId: number | null): Promise<SubmitResult<PhoneReadinessResult>>
  submitMediaStyleQuiz(answers: MediaStyleAnswers, userId: number | null): Promise<SubmitResult<MediaStyleResult>>

  /** Ownership-gated fetch (spec: submissions are private, user-linked). */
  getOwnedSubmission(id: number, requesterId: number | undefined, isAdminOverride: boolean): Promise<ToolSubmissionRecord | null>
}

const TOOL_SLUGS = {
  familyAgreement: 'family_media_contract',
  phoneReadiness: 'phone_readiness_checklist',
  mediaStyleQuiz: 'media_style_quiz',
} as const

async function persistSubmission(
  repo: ToolRepository,
  slug: string,
  userId: number | null,
  answers: unknown,
  result: unknown,
): Promise<number | null> {
  if (userId === null) return null // anonymous preview: never persisted (spec §11)
  const tool = await repo.findBySlug(slug)
  if (!tool) throw new Error(`unknown_tool_slug:${slug}`)
  const submission = await repo.createSubmission({
    toolId: tool.id,
    userId,
    answersJson: JSON.stringify(answers),
    resultJson: JSON.stringify(result),
  })
  return submission.id
}

export function createToolService(repo: ToolRepository): ToolService {
  return {
    async getToolBySlug(slug) {
      return repo.findBySlug(slug)
    },

    async getToolById(id) {
      return repo.findById(id)
    },

    async listActiveTools() {
      return repo.listActive()
    },

    async submitFamilyAgreement(input, userId) {
      const result = computeFamilyAgreementResult(input)
      const submissionId = await persistSubmission(repo, TOOL_SLUGS.familyAgreement, userId, input, result)
      return { submissionId, result }
    },

    async submitPhoneReadiness(answers, userId) {
      const result = computePhoneReadinessResult(answers)
      const submissionId = await persistSubmission(repo, TOOL_SLUGS.phoneReadiness, userId, answers, result)
      return { submissionId, result }
    },

    async submitMediaStyleQuiz(answers, userId) {
      const result = computeMediaStyleResult(answers)
      const submissionId = await persistSubmission(repo, TOOL_SLUGS.mediaStyleQuiz, userId, answers, result)
      return { submissionId, result }
    },

    async getOwnedSubmission(id, requesterId, isAdminOverride) {
      const submission = await repo.findSubmissionById(id)
      if (!submission) return null
      if (isAdminOverride) return submission
      if (!requesterId || submission.userId !== requesterId) return null
      return submission
    },
  }
}

export { TOOL_SLUGS }
