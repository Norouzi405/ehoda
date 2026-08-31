/**
 * Service layer (portability rule 3.1): question intake, classification,
 * crisis triage integration and moderation transitions. Pure business
 * logic, zero framework/Cloudflare imports.
 */
import type { QuestionRepository, QuestionListItem, QuestionDetail, QuestionRawDetail, QuestionAssignmentItem } from '../repositories/question.repository'
import type { SettingsRepository } from '../repositories/settings.repository'
import { runCrisisTriage, DEFAULT_CRISIS_KEYWORDS } from './crisis-triage.service'
import { randomHex } from '../lib/crypto'

export const AUTHOR_ROLES = ['father', 'mother', 'teacher', 'mentor', 'school_counselor', 'other'] as const
export const CONTEXT_SPACES = ['home', 'school', 'couple'] as const
export const URGENCY_LEVELS = ['normal', 'concerning', 'urgent'] as const
export const PUBLICATION_CHOICES = ['publish_after_anonymization', 'private_referral_only'] as const

export interface SubmitQuestionInput {
  authorUserId: number
  authorRole?: string
  contextSpace?: string
  ageGroupSlug?: string
  categorySlug?: string
  isRecurring: boolean
  urgencyLevel: string
  rawTitle: string
  rawWhatHappened: string
  rawSinceWhen?: string
  rawTriedSoFar?: string
  rawHelpRequested?: string
  publicationChoice: string
}

export type SubmitQuestionResult =
  | { ok: true; slug: string; status: string; isCrisis: boolean }
  | { ok: false; error: 'validation_error'; message: string }

function slugify(base: string): string {
  const asciiPart = base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
  const suffix = randomHex(4)
  return asciiPart ? `${asciiPart}-${suffix}` : `question-${suffix}`
}

export interface QuestionService {
  submit(input: SubmitQuestionInput, nowIso: string): Promise<SubmitQuestionResult>
  listPublished(params: { categorySlug?: string; ageGroupSlug?: string; page?: number }): Promise<{ items: QuestionListItem[]; total: number; page: number; pageSize: number }>
  getPublishedBySlug(slug: string): Promise<QuestionDetail | null>
  getRawForViewer(slug: string, viewerUserId: number | undefined, canViewPrivate: boolean): Promise<QuestionRawDetail | null>
  listCategories(): Promise<{ id: number; slug: string; nameFa: string }[]>
  listAgeGroups(): Promise<{ id: number; slug: string; labelFa: string }[]>
  // moderation
  listForModeration(params: { status?: string; page?: number }): Promise<{ items: QuestionRawDetail[]; total: number }>
  approveAndPublish(id: number, moderatorUserId: number, edits?: { publicTitle?: string; publicBody?: string; categorySlug?: string; ageGroupSlug?: string }): Promise<void>
  reject(id: number, moderatorUserId: number, reason: string): Promise<void>
  referToProfessional(id: number, moderatorUserId: number, professionalUserId: number, note?: string): Promise<void>
  moveToCrisisReferral(id: number, moderatorUserId: number, note?: string): Promise<void>
  requestAnonymizationEdit(id: number, moderatorUserId: number, edits: { publicTitle?: string; publicBody?: string; categorySlug?: string; ageGroupSlug?: string }): Promise<void>
  // professional cartable
  listAssignedTo(userId: number): Promise<QuestionAssignmentItem[]>
  listInExpertiseAreas(categoryIds: number[], excludeAuthorUserId?: number): Promise<{ items: QuestionListItem[]; total: number }>
}

export function createQuestionService(repo: QuestionRepository, settingsRepo: SettingsRepository): QuestionService {
  return {
    async submit(input, nowIso) {
      if (!input.rawWhatHappened || input.rawWhatHappened.trim().length < 50) {
        return { ok: false, error: 'validation_error', message: 'شرح رویداد باید حداقل ۵۰ کاراکتر باشد.' }
      }
      if (!input.rawTitle || input.rawTitle.trim().length < 3) {
        return { ok: false, error: 'validation_error', message: 'عنوان پرسش الزامی است.' }
      }
      if (!PUBLICATION_CHOICES.includes(input.publicationChoice as (typeof PUBLICATION_CHOICES)[number])) {
        return { ok: false, error: 'validation_error', message: 'گزینهٔ انتشار نامعتبر است.' }
      }

      const keywords = await settingsRepo.getJson<string[]>('crisis_keywords', DEFAULT_CRISIS_KEYWORDS)
      const effectiveKeywords = keywords.length > 0 ? keywords : DEFAULT_CRISIS_KEYWORDS
      const triage = runCrisisTriage([input.rawTitle, input.rawWhatHappened, input.rawTriedSoFar, input.rawHelpRequested], effectiveKeywords)

      // Crisis Triage Filter (spec §9.11): a match forces private_referral
      // immediately, bypassing the normal submitted/under_review queue
      // entirely and regardless of the user's own publication choice.
      const status = triage.isFlagged
        ? 'private_referral'
        : input.publicationChoice === 'private_referral_only'
          ? 'private_referral'
          : 'submitted'

      const slug = slugify(input.rawTitle)

      const created = await repo.create({
        authorUserId: input.authorUserId,
        authorRole: input.authorRole,
        contextSpace: input.contextSpace,
        ageGroupSlug: input.ageGroupSlug,
        categorySlug: input.categorySlug,
        isRecurring: input.isRecurring,
        urgencyLevel: URGENCY_LEVELS.includes(input.urgencyLevel as (typeof URGENCY_LEVELS)[number]) ? input.urgencyLevel : 'normal',
        rawTitle: input.rawTitle.trim(),
        rawWhatHappened: input.rawWhatHappened.trim(),
        rawSinceWhen: input.rawSinceWhen,
        rawTriedSoFar: input.rawTriedSoFar,
        rawHelpRequested: input.rawHelpRequested,
        publicationChoice: input.publicationChoice,
        consentAcceptedAt: nowIso,
        slug,
        status,
        isFlaggedSensitive: triage.isFlagged,
        flaggedKeywords: triage.isFlagged ? JSON.stringify(triage.matchedKeywords) : null,
      })

      await repo.recordStatusChange({
        questionId: created.id,
        fromStatus: null,
        toStatus: created.status,
        changedBy: input.authorUserId,
        note: triage.isFlagged ? 'auto-flagged by crisis triage filter' : undefined,
      })

      return { ok: true, slug: created.slug, status: created.status, isCrisis: triage.isFlagged }
    },

    async listPublished(params) {
      const page = params.page && params.page > 0 ? params.page : 1
      const pageSize = 12
      const { items, total } = await repo.listPublished({ categorySlug: params.categorySlug, ageGroupSlug: params.ageGroupSlug, page, pageSize })
      return { items, total, page, pageSize }
    },

    async getPublishedBySlug(slug) {
      return repo.findPublishedBySlug(slug)
    },

    async getRawForViewer(slug, viewerUserId, canViewPrivate) {
      const raw = await repo.findRawBySlug(slug)
      if (!raw) return null
      if (canViewPrivate || raw.authorUserId === viewerUserId) return raw
      // Not authorized for raw/private fields: only allow published questions,
      // and strip private raw fields (spec §10.3 privacy boundary).
      if (raw.status !== 'published') return null
      return {
        ...raw,
        authorUserId: 0,
        rawTitle: '',
        rawWhatHappened: '',
        rawSinceWhen: null,
        rawTriedSoFar: null,
        rawHelpRequested: null,
      }
    },

    async listCategories() {
      return repo.listCategories()
    },

    async listAgeGroups() {
      return repo.listAgeGroups()
    },

    async listForModeration(params) {
      const page = params.page && params.page > 0 ? params.page : 1
      return repo.listForModeration({ status: params.status, page, pageSize: 20 })
    },

    async approveAndPublish(id, moderatorUserId, edits) {
      const nowIso = new Date().toISOString()
      await repo.updateModeration(id, { status: 'published', publishedAt: nowIso, isAnonymized: true, ...edits })
      await repo.recordStatusChange({ questionId: id, fromStatus: null, toStatus: 'published', changedBy: moderatorUserId })
    },

    async reject(id, moderatorUserId, reason) {
      await repo.updateModeration(id, { status: 'rejected' })
      await repo.recordStatusChange({ questionId: id, fromStatus: null, toStatus: 'rejected', changedBy: moderatorUserId, note: reason })
    },

    async referToProfessional(id, moderatorUserId, professionalUserId, note) {
      await repo.updateModeration(id, { status: 'approved' })
      await repo.assignToProfessional({ questionId: id, assignedToUserId: professionalUserId, assignedBy: moderatorUserId, note })
      await repo.recordStatusChange({ questionId: id, fromStatus: null, toStatus: 'approved', changedBy: moderatorUserId, note: `referred to user ${professionalUserId}` })
    },

    async moveToCrisisReferral(id, moderatorUserId, note) {
      await repo.updateModeration(id, { status: 'private_referral' })
      await repo.recordStatusChange({ questionId: id, fromStatus: null, toStatus: 'private_referral', changedBy: moderatorUserId, note })
    },

    async requestAnonymizationEdit(id, moderatorUserId, edits) {
      await repo.updateModeration(id, { status: 'under_review', isAnonymized: true, ...edits })
      await repo.recordStatusChange({ questionId: id, fromStatus: null, toStatus: 'under_review', changedBy: moderatorUserId, note: 'anonymization edit applied' })
    },

    async listAssignedTo(userId) {
      return repo.listAssignedTo(userId)
    },

    async listInExpertiseAreas(categoryIds, excludeAuthorUserId) {
      return repo.listPublishedInCategories({ categoryIds, excludeAuthorUserId })
    },
  }
}
