/**
 * Service layer (portability rule 3.1): threaded response/reply business
 * logic — tree assembly for rendering, tombstone-on-delete, structured
 * professor answer validation, vote/report orchestration. Pure logic,
 * depends only on repository interfaces injected by the caller.
 */
import type { ResponseRepository, ResponseRecord } from '../repositories/response.repository'
import type { AuthorLevel } from '../db/schema/responses'
import { rankResponses, type SortMode, type RankableResponse } from './response-ranking.service'

export interface ResponseTreeNode extends ResponseRecord {
  replies: ResponseTreeNode[]
}

export interface CreateResponseInput {
  questionId: number
  parentId?: number | null
  authorUserId: number
  authorLevelSnapshot: AuthorLevel | string
  body: string
  structuredMetaJson?: string | null
  replyToDisplayName?: string | null
  isPreModerated: boolean // whether this author's content requires pre-moderation (spec §9.5)
}

export type CreateResponseResult = { ok: true; response: ResponseRecord } | { ok: false; error: 'validation_error'; message: string }

/** Builds a nested reply tree from a flat list, ordered by the ranking algorithm at the top level. */
export function buildResponseTree(flat: ResponseRecord[], topLevelSortMode: SortMode = 'default'): ResponseTreeNode[] {
  const byId = new Map<number, ResponseTreeNode>()
  flat.forEach((r) => byId.set(r.id, { ...r, replies: [] }))

  const topLevel: ResponseTreeNode[] = []
  for (const r of flat) {
    const node = byId.get(r.id)!
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.replies.push(node)
    } else if (!r.parentId) {
      topLevel.push(node)
    }
  }

  // Replies within a thread are always chronological (spec: conversation
  // flow), only the TOP-LEVEL answers get the 4-tier ranking treatment.
  const sortReplies = (nodes: ResponseTreeNode[]) => {
    nodes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    nodes.forEach((n) => sortReplies(n.replies))
  }
  sortReplies(topLevel)

  const ranked = rankResponses(topLevel as unknown as RankableResponse[], topLevelSortMode) as unknown as ResponseTreeNode[]
  return ranked
}

export interface ResponseService {
  create(input: CreateResponseInput): Promise<CreateResponseResult>
  getTreeForQuestion(questionId: number, sortMode: SortMode, includeUnpublished: boolean): Promise<ResponseTreeNode[]>
  deleteOwn(responseId: number, requesterUserId: number): Promise<{ ok: boolean; error?: string }>
  deleteByModerator(responseId: number, moderatorUserId: number, reason?: string): Promise<{ ok: boolean }>
  vote(responseId: number, userId: number): Promise<{ ok: true } | { ok: false; error: 'already_voted' | 'not_found' }>
  report(responseId: number, userId: number, reason: string, note?: string): Promise<void>
  markEditorPick(responseId: number, value: boolean, moderatorUserId: number): Promise<void>
  markScienceReviewed(responseId: number, value: boolean, moderatorUserId: number): Promise<void>
  approve(responseId: number, moderatorUserId: number): Promise<void>
  reject(responseId: number, moderatorUserId: number, reason?: string): Promise<void>
  hide(responseId: number, moderatorUserId: number, reason?: string): Promise<void>
  listReports(status?: string): ReturnType<ResponseRepository['listReports']>
  resolveReport(id: number, moderatorUserId: number, status: string): Promise<void>
  listForModeration(status?: string): Promise<ResponseRecord[]>
}

export function createResponseService(repo: ResponseRepository, clock: () => number = () => Date.now()): ResponseService {
  return {
    async create(input) {
      if (!input.body || input.body.trim().length < 2) {
        return { ok: false, error: 'validation_error', message: 'متن پاسخ الزامی است.' }
      }

      const status = input.isPreModerated ? 'under_review' : 'published'
      const publishedAt = input.isPreModerated ? null : new Date(clock()).toISOString()

      const response = await repo.create({
        questionId: input.questionId,
        parentId: input.parentId,
        authorUserId: input.authorUserId,
        authorLevelSnapshot: input.authorLevelSnapshot,
        body: input.body.trim(),
        structuredMetaJson: input.structuredMetaJson,
        status,
        replyToDisplayName: input.replyToDisplayName,
        publishedAt,
      })

      return { ok: true, response }
    },

    async getTreeForQuestion(questionId, sortMode, includeUnpublished) {
      const statuses = includeUnpublished ? undefined : ['published']
      const flat = await repo.listByQuestion(questionId, { statuses })
      return buildResponseTree(flat, sortMode)
    },

    async deleteOwn(responseId, requesterUserId) {
      const record = await repo.findById(responseId)
      if (!record) return { ok: false, error: 'not_found' }
      if (record.authorUserId !== requesterUserId) return { ok: false, error: 'forbidden' }
      // Tombstone-on-delete (spec §9.7): the physical row is NEVER deleted so
      // any existing replies keep a valid parentId chain.
      await repo.tombstone(responseId, requesterUserId, false)
      return { ok: true }
    },

    async deleteByModerator(responseId, moderatorUserId, reason) {
      await repo.tombstone(responseId, moderatorUserId, true)
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'hide', performedBy: moderatorUserId, reason })
      return { ok: true }
    },

    async vote(responseId, userId) {
      const record = await repo.findById(responseId)
      if (!record) return { ok: false, error: 'not_found' }
      const already = await repo.hasVoted(responseId, userId)
      if (already) return { ok: false, error: 'already_voted' }
      const result = await repo.addVote(responseId, userId)
      if (!result.ok) return { ok: false, error: 'already_voted' }
      return { ok: true }
    },

    async report(responseId, userId, reason, note) {
      await repo.createReport({ responseId, reportedBy: userId, reason, note })
    },

    async markEditorPick(responseId, value, moderatorUserId) {
      await repo.markEditorPick(responseId, value)
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'edit', performedBy: moderatorUserId, reason: value ? 'set editor_pick' : 'unset editor_pick' })
    },

    async markScienceReviewed(responseId, value, moderatorUserId) {
      await repo.markScienceReviewed(responseId, value)
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'edit', performedBy: moderatorUserId, reason: value ? 'set science_reviewed' : 'unset science_reviewed' })
    },

    async approve(responseId, moderatorUserId) {
      await repo.updateStatus(responseId, 'published')
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'approve', performedBy: moderatorUserId })
    },

    async reject(responseId, moderatorUserId, reason) {
      await repo.updateStatus(responseId, 'rejected')
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'reject', performedBy: moderatorUserId, reason })
    },

    async hide(responseId, moderatorUserId, reason) {
      await repo.updateStatus(responseId, 'hidden')
      await repo.logModerationAction({ targetType: 'response', targetId: responseId, action: 'hide', performedBy: moderatorUserId, reason })
    },

    async listReports(status) {
      return repo.listReports(status)
    },

    async resolveReport(id, moderatorUserId, status) {
      await repo.resolveReport(id, moderatorUserId, status)
    },

    async listForModeration(status) {
      return repo.listForModeration(status)
    },
  }
}
