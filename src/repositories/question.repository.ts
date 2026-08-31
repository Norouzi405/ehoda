/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `questions` / `question_status_histories` /
 * `question_assignments` / `question_internal_notes`.
 *
 * PRIVACY (spec §10.3, §16.1 acceptance test): list/detail DTOs returned to
 * public/professional callers NEVER include `authorUserId`'s phone number,
 * `rawTitle`, `rawWhatHappened`, `rawSinceWhen`, `rawTriedSoFar`, or
 * `rawHelpRequested` — only the moderator-curated `publicTitle`/`publicBody`.
 * The raw/private fields are only exposed via `findRawById`, which callers
 * MUST gate behind `requirePermission('question.view_private')` or an
 * author-ownership check.
 */
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import type { Database } from '../db/client'
import { questions, questionStatusHistories, questionAssignments, contentCategories, ageGroups } from '../db/schema'

export interface QuestionListItem {
  id: number
  slug: string
  publicTitle: string | null
  publicBody: string | null
  categorySlug: string | null
  categoryNameFa: string | null
  ageGroupSlug: string | null
  ageGroupLabelFa: string | null
  urgencyLevel: string
  status: string
  publishedAt: string | null
  createdAt: string
  responsesCount: number
}

export interface QuestionDetail extends QuestionListItem {
  authorRole: string | null
  contextSpace: string | null
  isRecurring: boolean
}

/** Only exposed to moderators (question.view_private) or the question's own author. */
export interface QuestionRawDetail extends QuestionDetail {
  authorUserId: number
  rawTitle: string
  rawWhatHappened: string
  rawSinceWhen: string | null
  rawTriedSoFar: string | null
  rawHelpRequested: string | null
  publicationChoice: string
  isFlaggedSensitive: boolean
  flaggedKeywords: string | null
}

export interface CreateQuestionInput {
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
  consentAcceptedAt?: string
  slug: string
  status: string
  isFlaggedSensitive: boolean
  flaggedKeywords?: string | null
}

export interface ListQuestionsParams {
  categorySlug?: string
  ageGroupSlug?: string
  page?: number
  pageSize?: number
}

export interface ListForModerationParams {
  status?: string
  page?: number
  pageSize?: number
}

export interface ListForExpertiseParams {
  categoryIds: number[]
  excludeAuthorUserId?: number
  page?: number
  pageSize?: number
}

export interface QuestionAssignmentItem {
  id: number
  questionId: number
  slug: string
  publicTitle: string | null
  status: string
  createdAt: string
}

export interface QuestionRepository {
  create(input: CreateQuestionInput): Promise<{ id: number; slug: string; status: string }>
  listPublished(params: ListQuestionsParams): Promise<{ items: QuestionListItem[]; total: number }>
  findPublishedBySlug(slug: string): Promise<QuestionDetail | null>
  findRawById(id: number): Promise<QuestionRawDetail | null>
  findRawBySlug(slug: string): Promise<QuestionRawDetail | null>
  listCategories(): Promise<{ id: number; slug: string; nameFa: string }[]>
  listAgeGroups(): Promise<{ id: number; slug: string; labelFa: string }[]>
  // --- moderation ---
  listForModeration(params: ListForModerationParams): Promise<{ items: QuestionRawDetail[]; total: number }>
  updateModeration(
    id: number,
    changes: {
      status?: string
      publicTitle?: string
      publicBody?: string
      isAnonymized?: boolean
      categorySlug?: string
      ageGroupSlug?: string
      publishedAt?: string
    },
  ): Promise<void>
  recordStatusChange(input: { questionId: number; fromStatus: string | null; toStatus: string; changedBy: number | null; note?: string }): Promise<void>
  assignToProfessional(input: { questionId: number; assignedToUserId: number; assignedBy: number; note?: string }): Promise<void>
  // --- professional cartable ---
  listAssignedTo(userId: number): Promise<QuestionAssignmentItem[]>
  listPublishedInCategories(params: ListForExpertiseParams): Promise<{ items: QuestionListItem[]; total: number }>
}

function toListItem(row: Record<string, unknown>): QuestionListItem {
  return {
    id: row.id as number,
    slug: row.slug as string,
    publicTitle: (row.publicTitle as string | null) ?? null,
    publicBody: (row.publicBody as string | null) ?? null,
    categorySlug: (row.categorySlug as string | null) ?? null,
    categoryNameFa: (row.categoryNameFa as string | null) ?? null,
    ageGroupSlug: (row.ageGroupSlug as string | null) ?? null,
    ageGroupLabelFa: (row.ageGroupLabelFa as string | null) ?? null,
    urgencyLevel: row.urgencyLevel as string,
    status: row.status as string,
    publishedAt: (row.publishedAt as string | null) ?? null,
    createdAt: row.createdAt as string,
    responsesCount: Number(row.responsesCount ?? 0),
  }
}

export function createQuestionRepository(db: Database): QuestionRepository {
  async function findRawByIdInternal(id: number): Promise<QuestionRawDetail | null> {
    const rows = await db
      .select({
        id: questions.id,
        slug: questions.slug,
        authorUserId: questions.authorUserId,
        publicTitle: questions.publicTitle,
        publicBody: questions.publicBody,
        categorySlug: contentCategories.slug,
        categoryNameFa: contentCategories.nameFa,
        ageGroupSlug: ageGroups.slug,
        ageGroupLabelFa: ageGroups.labelFa,
        urgencyLevel: questions.urgencyLevel,
        status: questions.status,
        publishedAt: questions.publishedAt,
        createdAt: questions.createdAt,
        authorRole: questions.authorRole,
        contextSpace: questions.contextSpace,
        isRecurring: questions.isRecurring,
        rawTitle: questions.rawTitle,
        rawWhatHappened: questions.rawWhatHappened,
        rawSinceWhen: questions.rawSinceWhen,
        rawTriedSoFar: questions.rawTriedSoFar,
        rawHelpRequested: questions.rawHelpRequested,
        publicationChoice: questions.publicationChoice,
        isFlaggedSensitive: questions.isFlaggedSensitive,
        flaggedKeywords: questions.flaggedKeywords,
        responsesCount: sql<number>`(select count(*) from responses r where r.question_id = questions.id and r.status = 'published' and r.is_tombstone = 0)`,
      })
      .from(questions)
      .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
      .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
      .where(eq(questions.id, id))
      .limit(1)

    const row = rows[0]
    if (!row) return null
    return {
      ...toListItem(row),
      authorUserId: row.authorUserId,
      authorRole: row.authorRole,
      contextSpace: row.contextSpace,
      isRecurring: Boolean(row.isRecurring),
      rawTitle: row.rawTitle,
      rawWhatHappened: row.rawWhatHappened,
      rawSinceWhen: row.rawSinceWhen,
      rawTriedSoFar: row.rawTriedSoFar,
      rawHelpRequested: row.rawHelpRequested,
      publicationChoice: row.publicationChoice,
      isFlaggedSensitive: Boolean(row.isFlaggedSensitive),
      flaggedKeywords: row.flaggedKeywords,
    }
  }

  return {
    async create(input) {
      let categoryId: number | undefined
      if (input.categorySlug) {
        const rows = await db.select({ id: contentCategories.id }).from(contentCategories).where(eq(contentCategories.slug, input.categorySlug)).limit(1)
        categoryId = rows[0]?.id
      }
      let ageGroupId: number | undefined
      if (input.ageGroupSlug) {
        const rows = await db.select({ id: ageGroups.id }).from(ageGroups).where(eq(ageGroups.slug, input.ageGroupSlug)).limit(1)
        ageGroupId = rows[0]?.id
      }

      const inserted = await db
        .insert(questions)
        .values({
          slug: input.slug,
          authorUserId: input.authorUserId,
          authorRole: input.authorRole,
          contextSpace: input.contextSpace,
          ageGroupId,
          categoryId,
          isRecurring: input.isRecurring,
          urgencyLevel: input.urgencyLevel,
          rawTitle: input.rawTitle,
          rawWhatHappened: input.rawWhatHappened,
          rawSinceWhen: input.rawSinceWhen,
          rawTriedSoFar: input.rawTriedSoFar,
          rawHelpRequested: input.rawHelpRequested,
          publicationChoice: input.publicationChoice,
          consentAcceptedAt: input.consentAcceptedAt,
          status: input.status,
          isFlaggedSensitive: input.isFlaggedSensitive,
          flaggedKeywords: input.flaggedKeywords ?? null,
        })
        .returning({ id: questions.id, slug: questions.slug, status: questions.status })

      return inserted[0]
    },

    async listPublished({ categorySlug, ageGroupSlug, page = 1, pageSize = 12 }) {
      const offset = (page - 1) * pageSize
      const conditions = [eq(questions.status, 'published')]
      if (categorySlug) conditions.push(eq(contentCategories.slug, categorySlug))
      if (ageGroupSlug) conditions.push(eq(ageGroups.slug, ageGroupSlug))
      const whereClause = and(...conditions)

      const rows = await db
        .select({
          id: questions.id,
          slug: questions.slug,
          publicTitle: questions.publicTitle,
          publicBody: questions.publicBody,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          ageGroupSlug: ageGroups.slug,
          ageGroupLabelFa: ageGroups.labelFa,
          urgencyLevel: questions.urgencyLevel,
          status: questions.status,
          publishedAt: questions.publishedAt,
          createdAt: questions.createdAt,
          responsesCount: sql<number>`(select count(*) from responses r where r.question_id = questions.id and r.status = 'published' and r.is_tombstone = 0)`,
        })
        .from(questions)
        .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
        .where(whereClause)
        .orderBy(desc(questions.publishedAt))
        .limit(pageSize)
        .offset(offset)

      const countRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(questions)
        .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
        .where(whereClause)

      return { items: rows.map(toListItem), total: Number(countRows[0]?.count ?? 0) }
    },

    async findPublishedBySlug(slug) {
      const rows = await db
        .select({
          id: questions.id,
          slug: questions.slug,
          publicTitle: questions.publicTitle,
          publicBody: questions.publicBody,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          ageGroupSlug: ageGroups.slug,
          ageGroupLabelFa: ageGroups.labelFa,
          urgencyLevel: questions.urgencyLevel,
          status: questions.status,
          publishedAt: questions.publishedAt,
          createdAt: questions.createdAt,
          authorRole: questions.authorRole,
          contextSpace: questions.contextSpace,
          isRecurring: questions.isRecurring,
          responsesCount: sql<number>`(select count(*) from responses r where r.question_id = questions.id and r.status = 'published' and r.is_tombstone = 0)`,
        })
        .from(questions)
        .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
        .where(and(eq(questions.slug, slug), eq(questions.status, 'published')))
        .limit(1)

      const row = rows[0]
      if (!row) return null
      return { ...toListItem(row), authorRole: row.authorRole, contextSpace: row.contextSpace, isRecurring: Boolean(row.isRecurring) }
    },

    async findRawById(id) {
      return findRawByIdInternal(id)
    },

    async findRawBySlug(slug) {
      const rows = await db.select({ id: questions.id }).from(questions).where(eq(questions.slug, slug)).limit(1)
      if (!rows[0]) return null
      return findRawByIdInternal(rows[0].id)
    },

    async listCategories() {
      const rows = await db.select({ id: contentCategories.id, slug: contentCategories.slug, nameFa: contentCategories.nameFa }).from(contentCategories).where(eq(contentCategories.isActive, true)).orderBy(contentCategories.sortOrder)
      return rows
    },

    async listAgeGroups() {
      const rows = await db.select({ id: ageGroups.id, slug: ageGroups.slug, labelFa: ageGroups.labelFa }).from(ageGroups).orderBy(ageGroups.sortOrder)
      return rows
    },

    async listForModeration({ status, page = 1, pageSize = 20 }) {
      const offset = (page - 1) * pageSize
      const whereClause = status ? eq(questions.status, status) : undefined

      const rows = await db
        .select({
          id: questions.id,
          slug: questions.slug,
          authorUserId: questions.authorUserId,
          publicTitle: questions.publicTitle,
          publicBody: questions.publicBody,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          ageGroupSlug: ageGroups.slug,
          ageGroupLabelFa: ageGroups.labelFa,
          urgencyLevel: questions.urgencyLevel,
          status: questions.status,
          publishedAt: questions.publishedAt,
          createdAt: questions.createdAt,
          authorRole: questions.authorRole,
          contextSpace: questions.contextSpace,
          isRecurring: questions.isRecurring,
          rawTitle: questions.rawTitle,
          rawWhatHappened: questions.rawWhatHappened,
          rawSinceWhen: questions.rawSinceWhen,
          rawTriedSoFar: questions.rawTriedSoFar,
          rawHelpRequested: questions.rawHelpRequested,
          publicationChoice: questions.publicationChoice,
          isFlaggedSensitive: questions.isFlaggedSensitive,
          flaggedKeywords: questions.flaggedKeywords,
        })
        .from(questions)
        .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
        .where(whereClause)
        .orderBy(desc(questions.isFlaggedSensitive), questions.createdAt)
        .limit(pageSize)
        .offset(offset)

      const countRows = await db.select({ count: sql<number>`count(*)` }).from(questions).where(whereClause)

      const items: QuestionRawDetail[] = rows.map((row) => ({
        ...toListItem(row),
        authorUserId: row.authorUserId,
        authorRole: row.authorRole,
        contextSpace: row.contextSpace,
        isRecurring: Boolean(row.isRecurring),
        rawTitle: row.rawTitle,
        rawWhatHappened: row.rawWhatHappened,
        rawSinceWhen: row.rawSinceWhen,
        rawTriedSoFar: row.rawTriedSoFar,
        rawHelpRequested: row.rawHelpRequested,
        publicationChoice: row.publicationChoice,
        isFlaggedSensitive: Boolean(row.isFlaggedSensitive),
        flaggedKeywords: row.flaggedKeywords,
      }))

      return { items, total: Number(countRows[0]?.count ?? 0) }
    },

    async updateModeration(id, changes) {
      let categoryId: number | undefined
      if (changes.categorySlug) {
        const rows = await db.select({ id: contentCategories.id }).from(contentCategories).where(eq(contentCategories.slug, changes.categorySlug)).limit(1)
        categoryId = rows[0]?.id
      }
      let ageGroupId: number | undefined
      if (changes.ageGroupSlug) {
        const rows = await db.select({ id: ageGroups.id }).from(ageGroups).where(eq(ageGroups.slug, changes.ageGroupSlug)).limit(1)
        ageGroupId = rows[0]?.id
      }

      await db
        .update(questions)
        .set({
          ...(changes.status ? { status: changes.status } : {}),
          ...(changes.publicTitle !== undefined ? { publicTitle: changes.publicTitle } : {}),
          ...(changes.publicBody !== undefined ? { publicBody: changes.publicBody } : {}),
          ...(changes.isAnonymized !== undefined ? { isAnonymized: changes.isAnonymized } : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(ageGroupId !== undefined ? { ageGroupId } : {}),
          ...(changes.publishedAt !== undefined ? { publishedAt: changes.publishedAt } : {}),
          updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        })
        .where(eq(questions.id, id))
    },

    async recordStatusChange(input) {
      await db.insert(questionStatusHistories).values({
        questionId: input.questionId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        changedBy: input.changedBy,
        note: input.note,
      })
    },

    async assignToProfessional(input) {
      await db.insert(questionAssignments).values({
        questionId: input.questionId,
        assignedToUserId: input.assignedToUserId,
        assignedBy: input.assignedBy,
        note: input.note,
        status: 'pending',
      })
    },

    async listAssignedTo(userId) {
      const rows = await db
        .select({
          id: questionAssignments.id,
          questionId: questionAssignments.questionId,
          slug: questions.slug,
          publicTitle: questions.publicTitle,
          status: questionAssignments.status,
          createdAt: questionAssignments.createdAt,
        })
        .from(questionAssignments)
        .innerJoin(questions, eq(questions.id, questionAssignments.questionId))
        .where(and(eq(questionAssignments.assignedToUserId, userId), inArray(questionAssignments.status, ['pending', 'accepted'])))
        .orderBy(desc(questionAssignments.createdAt))

      return rows
    },

    async listPublishedInCategories({ categoryIds, excludeAuthorUserId, page = 1, pageSize = 20 }) {
      if (categoryIds.length === 0) return { items: [], total: 0 }
      const offset = (page - 1) * pageSize
      const conditions = [eq(questions.status, 'published'), inArray(questions.categoryId, categoryIds)]
      const whereClause = and(...conditions)

      const rows = await db
        .select({
          id: questions.id,
          slug: questions.slug,
          publicTitle: questions.publicTitle,
          publicBody: questions.publicBody,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          ageGroupSlug: ageGroups.slug,
          ageGroupLabelFa: ageGroups.labelFa,
          urgencyLevel: questions.urgencyLevel,
          status: questions.status,
          publishedAt: questions.publishedAt,
          createdAt: questions.createdAt,
          responsesCount: sql<number>`(select count(*) from responses r where r.question_id = questions.id and r.status = 'published' and r.is_tombstone = 0)`,
        })
        .from(questions)
        .leftJoin(contentCategories, eq(contentCategories.id, questions.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, questions.ageGroupId))
        .where(whereClause)
        .orderBy(desc(questions.publishedAt))
        .limit(pageSize)
        .offset(offset)

      const countRows = await db.select({ count: sql<number>`count(*)` }).from(questions).where(whereClause)

      return { items: rows.map(toListItem), total: Number(countRows[0]?.count ?? 0) }
    },
  }
}
