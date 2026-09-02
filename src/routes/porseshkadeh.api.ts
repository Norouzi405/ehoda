/**
 * پرسش‌کدهٔ خانواده و رسانه — JSON API only (Phase 2, spec §2, docs/api.md).
 * Mounted under `/api` in src/index.tsx (same convention as content.ts /
 * auth.ts). The human-facing SSR counterpart lives in
 * src/routes/porseshkadeh.pages.tsx and is mounted at the site root — it
 * calls this SAME Service layer, never duplicates business logic (D-004).
 * Thin HTTP layer only — all business logic lives in QuestionService /
 * ResponseService (portability rule 3.1).
 *
 * NOTE ON TERMINOLOGY (mandatory, spec §2): the ONLY acceptable term for
 * this module anywhere in routes, UI copy or docs is «پرسش‌کده». The
 * legacy/forbidden term «پرسش‌خانه» must never appear.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createQuestionRepository } from '../repositories/question.repository'
import { createQuestionService } from '../services/question.service'
import { createResponseRepository } from '../repositories/response.repository'
import { createResponseService } from '../services/response.service'
import { createSettingsRepository } from '../repositories/settings.repository'
import { createProfessionalRepository } from '../repositories/professional.repository'
import { createUserRepository } from '../repositories/user.repository'
import { createRoleRepository } from '../repositories/role.repository'
import { createAuthzService } from '../services/authz.service'
import { CURRENT_USER_ID_KEY, requirePermission } from '../middleware/rbac'
import type { SortMode } from '../services/response-ranking.service'

export const porseshkadehRoute = new Hono<{ Bindings: Bindings }>()

function services(ctx: ReturnType<typeof buildAppContext>) {
  const questionService = createQuestionService(createQuestionRepository(ctx.db), createSettingsRepository(ctx.db))
  const responseService = createResponseService(createResponseRepository(ctx.db))
  return { questionService, responseService }
}

// ------------------------- Question list / detail -------------------------

porseshkadehRoute.get('/porseshkadeh', async (c) => {
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const categorySlug = c.req.query('category') || undefined
  const ageGroupSlug = c.req.query('age_group') || undefined
  const page = c.req.query('page') ? Number(c.req.query('page')) : undefined
  const result = await questionService.listPublished({ categorySlug, ageGroupSlug, page })
  return c.json(result)
})

porseshkadehRoute.get('/porseshkadeh/taxonomy', async (c) => {
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const [categories, ageGroups] = await Promise.all([questionService.listCategories(), questionService.listAgeGroups()])
  return c.json({ categories, ageGroups })
})

const submitSchema = z.object({
  authorRole: z.string().optional(),
  contextSpace: z.string().optional(),
  ageGroupSlug: z.string().optional(),
  categorySlug: z.string().optional(),
  isRecurring: z.boolean().optional().default(false),
  urgencyLevel: z.string().optional().default('normal'),
  rawTitle: z.string().min(3),
  rawWhatHappened: z.string().min(50),
  rawSinceWhen: z.string().optional(),
  rawTriedSoFar: z.string().optional(),
  rawHelpRequested: z.string().optional(),
  publicationChoice: z.string(),
  turnstileToken: z.string().min(1),
})

porseshkadehRoute.post('/porseshkadeh', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const parsed = submitSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)
  }

  const ctx = buildAppContext(c)
  const captchaResult = await ctx.captcha.verify(parsed.data.turnstileToken, c.req.header('cf-connecting-ip'))
  if (!captchaResult.success) {
    return c.json({ error: 'captcha_failed' }, 400)
  }

  const { questionService } = services(ctx)
  const result = await questionService.submit({ ...parsed.data, authorUserId: userId }, new Date().toISOString())

  if (!result.ok) {
    return c.json({ error: result.error, message: result.message }, 400)
  }

  return c.json({ slug: result.slug, status: result.status, isCrisis: result.isCrisis })
})

porseshkadehRoute.get('/porseshkadeh/:slug', async (c) => {
  const ctx = buildAppContext(c)
  const { questionService, responseService } = services(ctx)

  const question = await questionService.getPublishedBySlug(c.req.param('slug'))
  if (!question) return c.json({ error: 'not_found' }, 404)

  const sortMode = (c.req.query('sort') as SortMode) || 'default'
  const tree = await responseService.getTreeForQuestion(question.id, sortMode, false)

  return c.json({ question, responses: tree })
})

// ------------------------- Responses / replies -------------------------

const createResponseSchema = z.object({
  parentId: z.number().int().positive().optional(),
  body: z.string().min(2),
  structuredMetaJson: z.string().optional(),
  replyToDisplayName: z.string().optional(),
  // Self-tagging checkbox (spec §2.2 tier 3: "این یک تجربهٔ شخصی من به‌عنوان
  // والد/مربی است"). Only meaningful for a top-level answer (parentId is
  // unset) submitted by a non-professional member; ignored for replies,
  // which are always plain community conversation regardless of this flag.
  asExperience: z.boolean().optional().default(false),
})

porseshkadehRoute.post('/porseshkadeh/:slug/responses', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const parsed = createResponseSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { questionService, responseService } = services(ctx)

  const question = await questionService.getPublishedBySlug(c.req.param('slug'))
  if (!question) return c.json({ error: 'not_found' }, 404)

  // Determine the author's credibility tier snapshot (spec §2.2/§9.3):
  // professor/expert from an active professional_profiles row, else
  // member_experience if the user explicitly ticked the "این یک تجربهٔ
  // شخصی من به‌عنوان والد/مربی است" checkbox on a TOP-LEVEL answer, else
  // plain member. Replies are always plain community conversation.
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)
  let authorLevelSnapshot: string = 'member'
  let isPreModerated = true
  if (profile) {
    authorLevelSnapshot = profile.credentialType // 'professor' | 'expert'
    isPreModerated = !profile.fastPublishEnabled
  } else {
    isPreModerated = true // MVP default: members always pre-moderated unless trust logic wired later
    if (!parsed.data.parentId && parsed.data.asExperience) {
      authorLevelSnapshot = 'member_experience'
    }
  }

  const result = await responseService.create({
    questionId: question.id,
    parentId: parsed.data.parentId ?? null,
    authorUserId: userId,
    authorLevelSnapshot,
    body: parsed.data.body,
    structuredMetaJson: parsed.data.structuredMetaJson,
    replyToDisplayName: parsed.data.replyToDisplayName,
    isPreModerated,
  })

  if (!result.ok) return c.json({ error: result.error, message: result.message }, 400)
  return c.json({ id: result.response.id, status: result.response.status })
})

porseshkadehRoute.post('/porseshkadeh/responses/:id/vote', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const id = Number(c.req.param('id'))
  const result = await responseService.vote(id, userId)
  if (!result.ok) {
    const statusByError = { already_voted: 409, not_found: 404 } as const
    return c.json({ error: result.error }, statusByError[result.error])
  }
  return c.json({ success: true })
})

const reportSchema = z.object({
  reason: z.enum(['insult', 'personal_info', 'advertising', 'dangerous_advice', 'off_topic', 'misinformation', 'other']),
  note: z.string().optional(),
})

porseshkadehRoute.post('/porseshkadeh/responses/:id/report', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const id = Number(c.req.param('id'))
  await responseService.report(id, userId, parsed.data.reason, parsed.data.note)
  return c.json({ success: true })
})

porseshkadehRoute.delete('/porseshkadeh/responses/:id', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const id = Number(c.req.param('id'))
  const result = await responseService.deleteOwn(id, userId)
  if (!result.ok) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 403)
  return c.json({ success: true })
})

// ------------------------- Professional cartable -------------------------

porseshkadehRoute.get('/porseshkadeh/cartable/assigned', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const items = await questionService.listAssignedTo(userId)
  return c.json({ items })
})

porseshkadehRoute.get('/porseshkadeh/cartable/expertise', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)
  if (!profile) return c.json({ items: [], total: 0 })
  const categoryIds = await professionalRepo.listExpertiseCategoryIds(profile.id)
  const result = await questionService.listInExpertiseAreas(categoryIds, userId)
  return c.json(result)
})

// ------------------------- Structured professor/expert draft flow (spec §2.4) -------------------------

const draftSchema = z.object({
  questionId: z.number().int().positive(),
  body: z.string().min(1),
  structuredMetaJson: z.string().optional(),
})

porseshkadehRoute.post('/porseshkadeh/cartable/draft', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const parsed = draftSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)
  if (!profile) return c.json({ error: 'forbidden', message: 'فقط استادان و کارشناسان تأییدشده می‌توانند پیش‌نویس ثبت کنند.' }, 403)

  const existing = await responseService.findMyDraft(parsed.data.questionId, userId)
  const saved = await responseService.saveDraft({
    questionId: parsed.data.questionId,
    authorUserId: userId,
    authorLevelSnapshot: profile.credentialType,
    body: parsed.data.body,
    structuredMetaJson: parsed.data.structuredMetaJson,
    existingDraftId: existing?.id ?? null,
  })

  return c.json({ id: saved.id, status: saved.status })
})

porseshkadehRoute.post('/porseshkadeh/cartable/draft/:id/submit', async (c) => {
  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const professionalRepo = createProfessionalRepository(ctx.db)
  const profile = await professionalRepo.findActiveByUserId(userId)
  if (!profile) return c.json({ error: 'forbidden' }, 403)

  const id = Number(c.req.param('id'))
  const result = await responseService.submitDraftForReview(id, !profile.fastPublishEnabled)
  if (!result.ok) return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 400)
  return c.json({ success: true })
})

// ------------------------- Admin moderation (permission-gated) -------------------------

porseshkadehRoute.get('/admin/moderation/questions', requirePermission('question.moderate'), async (c) => {
  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const status = c.req.query('status') || undefined
  const page = c.req.query('page') ? Number(c.req.query('page')) : undefined
  const result = await questionService.listForModeration({ status, page })
  return c.json(result)
})

const moderateQuestionSchema = z.object({
  action: z.enum(['approve_publish', 'refer', 'reject', 'crisis_referral', 'anonymize_edit']),
  publicTitle: z.string().optional(),
  publicBody: z.string().optional(),
  categorySlug: z.string().optional(),
  ageGroupSlug: z.string().optional(),
  reason: z.string().optional(),
  professionalUserId: z.number().int().positive().optional(),
  note: z.string().optional(),
})

porseshkadehRoute.post('/admin/moderation/questions/:id', requirePermission('question.moderate'), async (c) => {
  const moderatorUserId = c.get(CURRENT_USER_ID_KEY as never) as number
  const parsed = moderateQuestionSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { questionService } = services(ctx)
  const id = Number(c.req.param('id'))

  switch (parsed.data.action) {
    case 'approve_publish':
      await questionService.approveAndPublish(id, moderatorUserId, {
        publicTitle: parsed.data.publicTitle,
        publicBody: parsed.data.publicBody,
        categorySlug: parsed.data.categorySlug,
        ageGroupSlug: parsed.data.ageGroupSlug,
      })
      break
    case 'refer':
      if (!parsed.data.professionalUserId) return c.json({ error: 'validation_error', message: 'professionalUserId الزامی است.' }, 400)
      await questionService.referToProfessional(id, moderatorUserId, parsed.data.professionalUserId, parsed.data.note)
      break
    case 'reject':
      await questionService.reject(id, moderatorUserId, parsed.data.reason || 'بدون دلیل ذکرشده')
      break
    case 'crisis_referral':
      await questionService.moveToCrisisReferral(id, moderatorUserId, parsed.data.note)
      break
    case 'anonymize_edit':
      await questionService.requestAnonymizationEdit(id, moderatorUserId, {
        publicTitle: parsed.data.publicTitle,
        publicBody: parsed.data.publicBody,
        categorySlug: parsed.data.categorySlug,
        ageGroupSlug: parsed.data.ageGroupSlug,
      })
      break
  }

  return c.json({ success: true })
})

porseshkadehRoute.get('/admin/moderation/responses', requirePermission('response.moderate'), async (c) => {
  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const status = c.req.query('status') || undefined
  const items = await responseService.listForModeration(status)
  return c.json({ items })
})

const moderateResponseSchema = z.object({
  // NOTE: 'hide' and 'delete' are intentionally distinct (docs/moderation-and-safety.md §3):
  //  - hide:   status -> 'hidden', reversible via 'unhide', body/tree untouched.
  //  - delete: tombstone-on-delete (spec §9.7/§2.3) — body replaced with the
  //    canonical placeholder, irreversible from the UI, but the row and any
  //    replies underneath it are preserved so the thread never breaks.
  action: z.enum(['approve', 'reject', 'hide', 'unhide', 'delete', 'editor_pick', 'unset_editor_pick', 'science_reviewed', 'unset_science_reviewed']),
  reason: z.string().optional(),
})

porseshkadehRoute.post('/admin/moderation/responses/:id', requirePermission('response.moderate'), async (c) => {
  const moderatorUserId = c.get(CURRENT_USER_ID_KEY as never) as number
  const parsed = moderateResponseSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const id = Number(c.req.param('id'))

  switch (parsed.data.action) {
    case 'approve':
      await responseService.approve(id, moderatorUserId)
      break
    case 'reject':
      await responseService.reject(id, moderatorUserId, parsed.data.reason)
      break
    case 'hide':
      await responseService.hide(id, moderatorUserId, parsed.data.reason)
      break
    case 'unhide':
      await responseService.approve(id, moderatorUserId)
      break
    case 'delete':
      await responseService.deleteByModerator(id, moderatorUserId, parsed.data.reason)
      break
    case 'editor_pick':
      await responseService.markEditorPick(id, true, moderatorUserId)
      break
    case 'unset_editor_pick':
      await responseService.markEditorPick(id, false, moderatorUserId)
      break
    case 'science_reviewed':
      await responseService.markScienceReviewed(id, true, moderatorUserId)
      break
    case 'unset_science_reviewed':
      await responseService.markScienceReviewed(id, false, moderatorUserId)
      break
  }

  return c.json({ success: true })
})

porseshkadehRoute.get('/admin/moderation/reports', requirePermission('moderation.resolve_report'), async (c) => {
  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const status = c.req.query('status') || undefined
  const items = await responseService.listReports(status)
  return c.json({ items })
})

const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  penalty: z.enum(['none', 'delete_comment', 'warn_user', 'suspend_user']).optional().default('none'),
  suspendDays: z.number().int().positive().max(90).optional().default(7),
})

porseshkadehRoute.post('/admin/moderation/reports/:id', requirePermission('moderation.resolve_report'), async (c) => {
  const moderatorUserId = c.get(CURRENT_USER_ID_KEY as never) as number
  const parsed = resolveReportSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_input', message: parsed.error.message }, 400)

  const ctx = buildAppContext(c)
  const { responseService } = services(ctx)
  const id = Number(c.req.param('id'))

  // warn_user / suspend_user require the stronger `moderation.restrict_user`
  // permission (spec §2.5: "اخطار به کاربر، تعلیق موقت"), separate from the
  // base `moderation.resolve_report` permission that gates this whole route
  // — a moderator who can only resolve reports must not silently escalate
  // to restricting an account.
  if (parsed.data.penalty === 'warn_user' || parsed.data.penalty === 'suspend_user') {
    const authz = createAuthzService(createRoleRepository(ctx.db))
    const canRestrict = await authz.hasPermission(moderatorUserId, 'moderation.restrict_user')
    if (!canRestrict) return c.json({ error: 'forbidden', required_permission: 'moderation.restrict_user' }, 403)
  }

  const reports = await responseService.listReports()
  const report = reports.find((r) => r.id === id)
  if (!report) return c.json({ error: 'not_found' }, 404)

  const userRepo = createUserRepository(ctx.db)

  if (parsed.data.penalty === 'delete_comment') {
    await responseService.deleteByModerator(report.responseId, moderatorUserId, 'report penalty: delete_comment')
  } else if (parsed.data.penalty === 'warn_user') {
    await userRepo.imposeRestriction({ userId: report.authorUserId, type: 'warning', reason: `اخطار به دلیل گزارش تخلف #${id}`, imposedBy: moderatorUserId })
    await userRepo.notify({ userId: report.authorUserId, type: 'moderation_warning', payloadJson: JSON.stringify({ reportId: id }) })
  } else if (parsed.data.penalty === 'suspend_user') {
    const endsAt = new Date(Date.now() + parsed.data.suspendDays * 24 * 60 * 60 * 1000).toISOString()
    await userRepo.imposeRestriction({ userId: report.authorUserId, type: 'suspension', reason: `تعلیق موقت به دلیل گزارش تخلف #${id}`, imposedBy: moderatorUserId, endsAt })
    await userRepo.notify({ userId: report.authorUserId, type: 'moderation_suspension', payloadJson: JSON.stringify({ reportId: id, endsAt }) })
    // A suspension also removes the offending content from public view.
    await responseService.deleteByModerator(report.responseId, moderatorUserId, 'report penalty: suspend_user')
  }

  await responseService.resolveReport(id, moderatorUserId, parsed.data.status)
  return c.json({ success: true })
})
