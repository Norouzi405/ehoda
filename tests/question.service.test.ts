import { describe, it, expect } from 'vitest'
import { createQuestionService } from '../src/services/question.service'
import type { QuestionRepository, QuestionRawDetail, CreateQuestionInput } from '../src/repositories/question.repository'
import type { SettingsRepository } from '../src/repositories/settings.repository'
import { DEFAULT_CRISIS_KEYWORDS } from '../src/services/crisis-triage.service'

/**
 * Fake QuestionRepository — in-memory store, implements only the surface
 * QuestionService actually calls. Follows the codebase's established
 * fake-repo test pattern (see tests/authz.service.test.ts, tests/content.service.test.ts).
 */
function createFakeQuestionRepo(seed: Partial<QuestionRawDetail>[] = []): QuestionRepository & {
  statusChanges: Array<{ questionId: number; fromStatus: string | null; toStatus: string; changedBy: number | null; note?: string }>
} {
  const rows: QuestionRawDetail[] = seed.map((s, idx) => ({
    id: s.id ?? idx + 1,
    slug: s.slug ?? `slug-${idx + 1}`,
    publicTitle: s.publicTitle ?? null,
    publicBody: s.publicBody ?? null,
    categorySlug: s.categorySlug ?? null,
    categoryNameFa: s.categoryNameFa ?? null,
    ageGroupSlug: s.ageGroupSlug ?? null,
    ageGroupLabelFa: s.ageGroupLabelFa ?? null,
    urgencyLevel: s.urgencyLevel ?? 'normal',
    status: s.status ?? 'published',
    publishedAt: s.publishedAt ?? '2026-01-01T00:00:00.000Z',
    createdAt: s.createdAt ?? '2026-01-01T00:00:00.000Z',
    responsesCount: s.responsesCount ?? 0,
    authorRole: s.authorRole ?? 'mother',
    contextSpace: s.contextSpace ?? 'home',
    isRecurring: s.isRecurring ?? false,
    authorUserId: s.authorUserId ?? 1,
    rawTitle: s.rawTitle ?? 'عنوان خام',
    rawWhatHappened: s.rawWhatHappened ?? 'شرح خام رویداد که قابل مشاهده برای عموم نیست.',
    rawSinceWhen: s.rawSinceWhen ?? 'یک ماه پیش',
    rawTriedSoFar: s.rawTriedSoFar ?? 'صحبت کردیم',
    rawHelpRequested: s.rawHelpRequested ?? 'راهنمایی می‌خواهم',
    publicationChoice: s.publicationChoice ?? 'publish_after_anonymization',
    isFlaggedSensitive: s.isFlaggedSensitive ?? false,
    flaggedKeywords: s.flaggedKeywords ?? null,
  }))

  let nextId = rows.length + 1
  const statusChanges: Array<{ questionId: number; fromStatus: string | null; toStatus: string; changedBy: number | null; note?: string }> = []

  return {
    statusChanges,
    async create(input: CreateQuestionInput) {
      const id = nextId++
      rows.push({
        id,
        slug: input.slug,
        publicTitle: null,
        publicBody: null,
        categorySlug: input.categorySlug ?? null,
        categoryNameFa: null,
        ageGroupSlug: input.ageGroupSlug ?? null,
        ageGroupLabelFa: null,
        urgencyLevel: input.urgencyLevel,
        status: input.status,
        publishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        responsesCount: 0,
        authorRole: input.authorRole ?? null,
        contextSpace: input.contextSpace ?? null,
        isRecurring: input.isRecurring,
        authorUserId: input.authorUserId,
        rawTitle: input.rawTitle,
        rawWhatHappened: input.rawWhatHappened,
        rawSinceWhen: input.rawSinceWhen ?? null,
        rawTriedSoFar: input.rawTriedSoFar ?? null,
        rawHelpRequested: input.rawHelpRequested ?? null,
        publicationChoice: input.publicationChoice,
        isFlaggedSensitive: input.isFlaggedSensitive,
        flaggedKeywords: input.flaggedKeywords ?? null,
      })
      return { id, slug: input.slug, status: input.status }
    },
    async listPublished() {
      return { items: [], total: 0 }
    },
    async findPublishedBySlug() {
      return null
    },
    async findRawById(id: number) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findRawBySlug(slug: string) {
      return rows.find((r) => r.slug === slug) ?? null
    },
    async listCategories() {
      return []
    },
    async listAgeGroups() {
      return []
    },
    async listForModeration() {
      return { items: [], total: 0 }
    },
    async updateModeration() {
      /* not used in these tests */
    },
    async recordStatusChange(input) {
      statusChanges.push(input)
    },
    async assignToProfessional() {
      /* not used in these tests */
    },
    async listAssignedTo() {
      return []
    },
    async listPublishedInCategories() {
      return { items: [], total: 0 }
    },
  }
}

function createFakeSettingsRepo(overrides: Record<string, unknown> = {}): SettingsRepository {
  return {
    async getJson<T>(key: string, fallback: T): Promise<T> {
      return key in overrides ? (overrides[key] as T) : fallback
    },
  }
}

const baseInput = {
  authorUserId: 42,
  authorRole: 'mother',
  contextSpace: 'home' as const,
  isRecurring: false,
  urgencyLevel: 'normal',
  rawTitle: 'عنوان یک پرسش عادی که مشکلی ندارد',
  rawWhatHappened: 'فرزندم اخیرا زمان زیادی را پای گوشی می‌گذراند و این نگران‌کننده است ولی بحران نیست.',
  rawSinceWhen: 'دو هفته',
  rawTriedSoFar: 'محدودیت زمانی گذاشتیم',
  rawHelpRequested: 'راهکار عملی می‌خواهم',
  publicationChoice: 'publish_after_anonymization',
}

describe('QuestionService.submit — Crisis Triage Filter (spec §9.11)', () => {
  it('routes a submission containing a crisis keyword to private_referral, regardless of publicationChoice', async () => {
    const repo = createFakeQuestionRepo()
    const settingsRepo = createFakeSettingsRepo({ crisis_keywords: DEFAULT_CRISIS_KEYWORDS })
    const service = createQuestionService(repo, settingsRepo)

    const result = await service.submit(
      {
        ...baseInput,
        // explicitly requests public anonymized publication — must be
        // overridden by the crisis triage filter
        publicationChoice: 'publish_after_anonymization',
        rawWhatHappened: 'او در پیام‌هایش دربارهٔ خودکشی صحبت می‌کند و من خیلی نگرانم و نمی‌دانم چه کنم.',
      },
      '2026-01-01T00:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('private_referral')
      expect(result.isCrisis).toBe(true)
    }
    // the flagged status transition must be recorded for audit purposes
    expect(repo.statusChanges[0]?.toStatus).toBe('private_referral')
    expect(repo.statusChanges[0]?.note).toMatch(/crisis/i)
  })

  it('does NOT flag a normal (non-crisis) submission — status stays "submitted"', async () => {
    const repo = createFakeQuestionRepo()
    const settingsRepo = createFakeSettingsRepo({ crisis_keywords: DEFAULT_CRISIS_KEYWORDS })
    const service = createQuestionService(repo, settingsRepo)

    const result = await service.submit(baseInput, '2026-01-01T00:00:00.000Z')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('submitted')
      expect(result.isCrisis).toBe(false)
    }
  })

  it('still routes to private_referral when the settings keyword list is empty (falls back to DEFAULT_CRISIS_KEYWORDS)', async () => {
    const repo = createFakeQuestionRepo()
    const settingsRepo = createFakeSettingsRepo({ crisis_keywords: [] })
    const service = createQuestionService(repo, settingsRepo)

    const result = await service.submit(
      { ...baseInput, rawWhatHappened: 'موضوع مربوط به آزار جنسی در مدرسه مطرح شده و باید سریع اقدام کنم.' },
      '2026-01-01T00:00:00.000Z',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('private_referral')
      expect(result.isCrisis).toBe(true)
    }
  })

  it('honours an explicit "private_referral_only" choice even without a crisis keyword match', async () => {
    const repo = createFakeQuestionRepo()
    const settingsRepo = createFakeSettingsRepo({ crisis_keywords: DEFAULT_CRISIS_KEYWORDS })
    const service = createQuestionService(repo, settingsRepo)

    const result = await service.submit({ ...baseInput, publicationChoice: 'private_referral_only' }, '2026-01-01T00:00:00.000Z')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('private_referral')
      expect(result.isCrisis).toBe(false) // not crisis-flagged, just a private choice
    }
  })
})

describe('QuestionService.getRawForViewer — privacy boundary (spec §10.3, §16.1)', () => {
  it('strips authorUserId + all raw identity/text fields for an unauthorized viewer of a published question', async () => {
    const repo = createFakeQuestionRepo([
      {
        id: 1,
        slug: 'public-question',
        status: 'published',
        authorUserId: 42,
        rawTitle: 'عنوان خصوصی نویسنده',
        rawWhatHappened: 'شرح کامل و خصوصی ماجرا که شامل جزئیات هویتی است.',
        rawSinceWhen: 'سه ماه پیش',
        rawTriedSoFar: 'با معلم صحبت کردیم',
        rawHelpRequested: 'راهنمایی تخصصی می‌خواهیم',
      },
    ])
    const settingsRepo = createFakeSettingsRepo()
    const service = createQuestionService(repo, settingsRepo)

    // viewer is neither the author (userId 999 !== 42) nor a moderator (canViewPrivate=false)
    const raw = await service.getRawForViewer('public-question', 999, false)

    expect(raw).not.toBeNull()
    expect(raw!.authorUserId).toBe(0)
    expect(raw!.rawTitle).toBe('')
    expect(raw!.rawWhatHappened).toBe('')
    expect(raw!.rawSinceWhen).toBeNull()
    expect(raw!.rawTriedSoFar).toBeNull()
    expect(raw!.rawHelpRequested).toBeNull()
  })

  it('returns null (not the stripped record) for a non-published question when the viewer is unauthorized', async () => {
    const repo = createFakeQuestionRepo([
      { id: 2, slug: 'under-review-question', status: 'under_review', authorUserId: 42 },
    ])
    const service = createQuestionService(repo, createFakeSettingsRepo())

    const raw = await service.getRawForViewer('under-review-question', 999, false)
    expect(raw).toBeNull()
  })

  it('returns the FULL raw record (including phone-linked authorUserId and raw text) to the question author themselves', async () => {
    const repo = createFakeQuestionRepo([
      {
        id: 3,
        slug: 'my-own-question',
        status: 'submitted',
        authorUserId: 42,
        rawTitle: 'عنوان من',
        rawWhatHappened: 'شرح کامل من دربارهٔ موضوع.',
      },
    ])
    const service = createQuestionService(repo, createFakeSettingsRepo())

    const raw = await service.getRawForViewer('my-own-question', 42, false)
    expect(raw).not.toBeNull()
    expect(raw!.authorUserId).toBe(42)
    expect(raw!.rawTitle).toBe('عنوان من')
    expect(raw!.rawWhatHappened).toBe('شرح کامل من دربارهٔ موضوع.')
  })

  it('returns the FULL raw record to a caller with canViewPrivate=true (moderator/professional) even if not the author', async () => {
    const repo = createFakeQuestionRepo([
      {
        id: 4,
        slug: 'needs-moderation',
        status: 'submitted',
        authorUserId: 42,
        rawTitle: 'عنوان محرمانه',
        rawWhatHappened: 'شرح محرمانه که فقط ناظر باید ببیند.',
      },
    ])
    const service = createQuestionService(repo, createFakeSettingsRepo())

    const raw = await service.getRawForViewer('needs-moderation', 7 /* moderator's own userId, != author */, true)
    expect(raw).not.toBeNull()
    expect(raw!.authorUserId).toBe(42)
    expect(raw!.rawTitle).toBe('عنوان محرمانه')
  })
})
