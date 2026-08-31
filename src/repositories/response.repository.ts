/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `responses` / `response_revisions` /
 * `response_votes` / `response_reports` / `moderation_actions`.
 *
 * Threading (spec §9.7, docs/question-and-community-workflow.md §4):
 *   parentId, rootResponseId and depth are computed and maintained here
 *   (never by DB triggers, per the portability rule).
 */
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { responses, responseVotes, responseReports, moderationActions, profiles } from '../db/schema'
import type { AuthorLevel } from '../db/schema/responses'

export interface ResponseRecord {
  id: number
  questionId: number
  parentId: number | null
  rootResponseId: number | null
  depth: number
  authorUserId: number
  authorDisplayName: string
  authorLevelSnapshot: string
  body: string
  structuredMetaJson: string | null
  status: string
  isEditorPick: boolean
  isScienceReviewed: boolean
  helpfulVotesCount: number
  replyToDisplayName: string | null
  isTombstone: boolean
  publishedAt: string | null
  createdAt: string
}

export interface CreateResponseInput {
  questionId: number
  parentId?: number | null
  authorUserId: number
  authorLevelSnapshot: AuthorLevel | string
  body: string
  structuredMetaJson?: string | null
  status: string
  replyToDisplayName?: string | null
  publishedAt?: string | null
}

export interface ResponseRepository {
  create(input: CreateResponseInput): Promise<ResponseRecord>
  listByQuestion(questionId: number, opts?: { statuses?: string[] }): Promise<ResponseRecord[]>
  findById(id: number): Promise<ResponseRecord | null>
  tombstone(id: number, actorUserId: number, byModerator: boolean): Promise<void>
  markEditorPick(id: number, value: boolean): Promise<void>
  markScienceReviewed(id: number, value: boolean): Promise<void>
  updateStatus(id: number, status: string): Promise<void>
  incrementHelpfulCount(id: number, delta: number): Promise<void>
  // votes
  hasVoted(responseId: number, userId: number): Promise<boolean>
  addVote(responseId: number, userId: number): Promise<{ ok: true } | { ok: false; error: 'already_voted' }>
  // reports
  createReport(input: { responseId: number; reportedBy: number; reason: string; note?: string }): Promise<void>
  listReports(status?: string): Promise<Array<{ id: number; responseId: number; reportedBy: number; reason: string; note: string | null; status: string; createdAt: string; responseBody: string; authorUserId: number }>>
  resolveReport(id: number, resolvedBy: number, status: string): Promise<void>
  logModerationAction(input: { targetType: 'question' | 'response'; targetId: number; action: string; performedBy: number; reason?: string; metadataJson?: string }): Promise<void>
  // moderation listing
  listForModeration(status?: string): Promise<ResponseRecord[]>
}

function toRecord(row: Record<string, unknown>): ResponseRecord {
  return {
    id: row.id as number,
    questionId: row.questionId as number,
    parentId: (row.parentId as number | null) ?? null,
    rootResponseId: (row.rootResponseId as number | null) ?? null,
    depth: row.depth as number,
    authorUserId: row.authorUserId as number,
    authorDisplayName: (row.authorDisplayName as string | null) ?? 'کاربر',
    authorLevelSnapshot: row.authorLevelSnapshot as string,
    body: row.body as string,
    structuredMetaJson: (row.structuredMetaJson as string | null) ?? null,
    status: row.status as string,
    isEditorPick: Boolean(row.isEditorPick),
    isScienceReviewed: Boolean(row.isScienceReviewed),
    helpfulVotesCount: row.helpfulVotesCount as number,
    replyToDisplayName: (row.replyToDisplayName as string | null) ?? null,
    isTombstone: Boolean(row.isTombstone),
    publishedAt: (row.publishedAt as string | null) ?? null,
    createdAt: row.createdAt as string,
  }
}

const SELECT_COLUMNS = {
  id: responses.id,
  questionId: responses.questionId,
  parentId: responses.parentId,
  rootResponseId: responses.rootResponseId,
  depth: responses.depth,
  authorUserId: responses.authorUserId,
  authorDisplayName: profiles.displayName,
  authorLevelSnapshot: responses.authorLevelSnapshot,
  body: responses.body,
  structuredMetaJson: responses.structuredMetaJson,
  status: responses.status,
  isEditorPick: responses.isEditorPick,
  isScienceReviewed: responses.isScienceReviewed,
  helpfulVotesCount: responses.helpfulVotesCount,
  replyToDisplayName: responses.replyToDisplayName,
  isTombstone: responses.isTombstone,
  publishedAt: responses.publishedAt,
  createdAt: responses.createdAt,
}

export function createResponseRepository(db: Database): ResponseRepository {
  return {
    async create(input) {
      let depth = 0
      let rootResponseId: number | null = null

      if (input.parentId) {
        const parentRows = await db.select({ depth: responses.depth, rootResponseId: responses.rootResponseId }).from(responses).where(eq(responses.id, input.parentId)).limit(1)
        const parent = parentRows[0]
        if (parent) {
          depth = parent.depth + 1
          rootResponseId = parent.rootResponseId ?? input.parentId
        }
      }

      const inserted = await db
        .insert(responses)
        .values({
          questionId: input.questionId,
          parentId: input.parentId ?? null,
          rootResponseId,
          depth,
          authorUserId: input.authorUserId,
          authorLevelSnapshot: input.authorLevelSnapshot,
          body: input.body,
          structuredMetaJson: input.structuredMetaJson ?? null,
          status: input.status,
          replyToDisplayName: input.replyToDisplayName ?? null,
          publishedAt: input.publishedAt ?? null,
        })
        .returning({ id: responses.id })

      const newId = inserted[0].id

      // A brand-new top-level response is its own root.
      if (!input.parentId) {
        await db.update(responses).set({ rootResponseId: newId }).where(eq(responses.id, newId))
      }

      const record = await this_findById(db, newId)
      return record as ResponseRecord
    },

    async listByQuestion(questionId, opts) {
      const conditions = [eq(responses.questionId, questionId)]
      const rows = await db
        .select(SELECT_COLUMNS)
        .from(responses)
        .leftJoin(profiles, eq(profiles.userId, responses.authorUserId))
        .where(and(...conditions))
        .orderBy(responses.createdAt)

      const filtered = opts?.statuses ? rows.filter((r) => opts.statuses!.includes(r.status)) : rows
      return filtered.map(toRecord)
    },

    async findById(id) {
      return this_findById(db, id)
    },

    async tombstone(id, actorUserId, byModerator) {
      await db
        .update(responses)
        .set({
          isTombstone: true,
          body: byModerator ? '[این نظر توسط ناظر حذف شده است]' : '[این نظر توسط کاربر حذف شده است]',
          updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        })
        .where(eq(responses.id, id))
    },

    async markEditorPick(id, value) {
      await db.update(responses).set({ isEditorPick: value }).where(eq(responses.id, id))
    },

    async markScienceReviewed(id, value) {
      await db.update(responses).set({ isScienceReviewed: value }).where(eq(responses.id, id))
    },

    async updateStatus(id, status) {
      await db.update(responses).set({ status }).where(eq(responses.id, id))
    },

    async incrementHelpfulCount(id, delta) {
      await db
        .update(responses)
        .set({ helpfulVotesCount: sql`${responses.helpfulVotesCount} + ${delta}` })
        .where(eq(responses.id, id))
    },

    async hasVoted(responseId, userId) {
      const rows = await db.select({ id: responseVotes.id }).from(responseVotes).where(and(eq(responseVotes.responseId, responseId), eq(responseVotes.userId, userId))).limit(1)
      return rows.length > 0
    },

    async addVote(responseId, userId) {
      try {
        await db.insert(responseVotes).values({ responseId, userId })
        await db
          .update(responses)
          .set({ helpfulVotesCount: sql`${responses.helpfulVotesCount} + 1` })
          .where(eq(responses.id, responseId))
        return { ok: true }
      } catch {
        // unique index violation -> duplicate vote (D-012 fix made this a real constraint)
        return { ok: false, error: 'already_voted' }
      }
    },

    async createReport(input) {
      await db.insert(responseReports).values({
        responseId: input.responseId,
        reportedBy: input.reportedBy,
        reason: input.reason,
        note: input.note,
        status: 'open',
      })
    },

    async listReports(status) {
      const whereClause = status ? eq(responseReports.status, status) : undefined
      const rows = await db
        .select({
          id: responseReports.id,
          responseId: responseReports.responseId,
          reportedBy: responseReports.reportedBy,
          reason: responseReports.reason,
          note: responseReports.note,
          status: responseReports.status,
          createdAt: responseReports.createdAt,
          responseBody: responses.body,
          authorUserId: responses.authorUserId,
        })
        .from(responseReports)
        .innerJoin(responses, eq(responses.id, responseReports.responseId))
        .where(whereClause)
        .orderBy(desc(responseReports.createdAt))
      return rows
    },

    async resolveReport(id, resolvedBy, status) {
      await db
        .update(responseReports)
        .set({ status, resolvedBy, resolvedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` })
        .where(eq(responseReports.id, id))
    },

    async logModerationAction(input) {
      await db.insert(moderationActions).values({
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        performedBy: input.performedBy,
        reason: input.reason,
        metadataJson: input.metadataJson,
      })
    },

    async listForModeration(status) {
      const whereClause = status ? eq(responses.status, status) : undefined
      const rows = await db
        .select(SELECT_COLUMNS)
        .from(responses)
        .leftJoin(profiles, eq(profiles.userId, responses.authorUserId))
        .where(whereClause)
        .orderBy(desc(responses.createdAt))
      return rows.map(toRecord)
    },
  }
}

async function this_findById(db: Database, id: number): Promise<ResponseRecord | null> {
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(responses)
    .leftJoin(profiles, eq(profiles.userId, responses.authorUserId))
    .where(eq(responses.id, id))
    .limit(1)
  const row = rows[0]
  return row ? toRecord(row) : null
}
