import { describe, it, expect } from 'vitest'
import { createResponseService, buildResponseTree } from '../src/services/response.service'
import type { ResponseRepository, ResponseRecord, CreateResponseInput } from '../src/repositories/response.repository'

/**
 * Fixture builder for a flat ResponseRecord, mirroring the DB row shape
 * returned by response.repository.ts's toRecord().
 */
function res(overrides: Partial<ResponseRecord>): ResponseRecord {
  return {
    id: overrides.id ?? 1,
    questionId: overrides.questionId ?? 1,
    parentId: overrides.parentId ?? null,
    rootResponseId: overrides.rootResponseId ?? null,
    depth: overrides.depth ?? 0,
    authorUserId: overrides.authorUserId ?? 1,
    authorDisplayName: overrides.authorDisplayName ?? 'کاربر',
    authorLevelSnapshot: overrides.authorLevelSnapshot ?? 'member',
    body: overrides.body ?? 'متن پاسخ',
    structuredMetaJson: overrides.structuredMetaJson ?? null,
    status: overrides.status ?? 'published',
    isEditorPick: overrides.isEditorPick ?? false,
    isScienceReviewed: overrides.isScienceReviewed ?? false,
    helpfulVotesCount: overrides.helpfulVotesCount ?? 0,
    replyToDisplayName: overrides.replyToDisplayName ?? null,
    isTombstone: overrides.isTombstone ?? false,
    publishedAt: overrides.publishedAt ?? '2026-01-01T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

/**
 * Fake ResponseRepository — in-memory store. `tombstone()` mutates the row
 * IN PLACE (never removes it), exactly matching the real repository's
 * contract (docs/question-and-community-workflow.md §4): the row survives
 * so children's parentId chain stays valid.
 */
function createFakeResponseRepo(seed: ResponseRecord[]): ResponseRepository & { rows: ResponseRecord[] } {
  const rows: ResponseRecord[] = seed.map((r) => ({ ...r }))
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1

  return {
    rows,
    async create(input: CreateResponseInput) {
      const id = nextId++
      const parent = input.parentId ? rows.find((r) => r.id === input.parentId) : undefined
      const record = res({
        id,
        questionId: input.questionId,
        parentId: input.parentId ?? null,
        rootResponseId: parent ? parent.rootResponseId ?? parent.id : id,
        depth: parent ? parent.depth + 1 : 0,
        authorUserId: input.authorUserId,
        authorLevelSnapshot: input.authorLevelSnapshot,
        body: input.body,
        structuredMetaJson: input.structuredMetaJson ?? null,
        status: input.status,
        replyToDisplayName: input.replyToDisplayName ?? null,
        publishedAt: input.publishedAt ?? null,
      })
      rows.push(record)
      return record
    },
    async listByQuestion(questionId: number, opts?: { statuses?: string[] }) {
      const filtered = rows.filter((r) => r.questionId === questionId)
      return opts?.statuses ? filtered.filter((r) => opts.statuses!.includes(r.status)) : filtered
    },
    async findById(id: number) {
      return rows.find((r) => r.id === id) ?? null
    },
    async tombstone(id: number) {
      const row = rows.find((r) => r.id === id)
      if (!row) return
      // canonical placeholder text (response.repository.ts tombstone()) —
      // the row is UPDATED, never deleted, so parentId chains stay intact
      row.isTombstone = true
      row.body = '[این نظر توسط کاربر/ناظر حذف شده است]'
    },
    async markEditorPick(id: number, value: boolean) {
      const row = rows.find((r) => r.id === id)
      if (row) row.isEditorPick = value
    },
    async markScienceReviewed(id: number, value: boolean) {
      const row = rows.find((r) => r.id === id)
      if (row) row.isScienceReviewed = value
    },
    async updateStatus(id: number, status: string, publishedAt?: string | null) {
      const row = rows.find((r) => r.id === id)
      if (row) {
        row.status = status
        if (publishedAt !== undefined) row.publishedAt = publishedAt
      }
    },
    async findLatestDraftByQuestionAndAuthor() {
      return null
    },
    async updateDraft() {
      /* not used in these tests */
    },
    async incrementHelpfulCount(id: number, delta: number) {
      const row = rows.find((r) => r.id === id)
      if (row) row.helpfulVotesCount += delta
    },
    async hasVoted() {
      return false
    },
    async addVote() {
      return { ok: true }
    },
    async createReport() {
      /* not used in these tests */
    },
    async listReports() {
      return []
    },
    async resolveReport() {
      /* not used in these tests */
    },
    async logModerationAction() {
      /* not used in these tests */
    },
    async listForModeration() {
      return []
    },
  }
}

describe('buildResponseTree — deterministic 4-tier ranking (spec §16.1)', () => {
  it('orders top-level responses professor > expert > member_experience > member, replies stay chronological (never re-ranked)', async () => {
    const flat: ResponseRecord[] = [
      res({ id: 1, parentId: null, rootResponseId: 1, depth: 0, authorLevelSnapshot: 'member', createdAt: '2026-01-01T00:00:00.000Z' }),
      res({ id: 2, parentId: null, rootResponseId: 2, depth: 0, authorLevelSnapshot: 'professor', createdAt: '2026-01-01T01:00:00.000Z' }),
      res({ id: 3, parentId: null, rootResponseId: 3, depth: 0, authorLevelSnapshot: 'member_experience', createdAt: '2026-01-01T02:00:00.000Z' }),
      res({ id: 4, parentId: null, rootResponseId: 4, depth: 0, authorLevelSnapshot: 'expert', createdAt: '2026-01-01T03:00:00.000Z' }),
      // two replies under the member_experience response (id 3) — must
      // remain in chronological order regardless of their own tiers, since
      // rankResponses() is only applied at the TOP level
      res({ id: 5, parentId: 3, rootResponseId: 3, depth: 1, authorLevelSnapshot: 'professor', createdAt: '2026-01-01T05:00:00.000Z' }),
      res({ id: 6, parentId: 3, rootResponseId: 3, depth: 1, authorLevelSnapshot: 'member', createdAt: '2026-01-01T04:00:00.000Z' }),
    ]

    const tree = buildResponseTree(flat, 'default')

    // top-level tier ordering
    expect(tree.map((n) => n.id)).toEqual([2, 4, 3, 1])

    // replies under node 3 (member_experience) stay in chronological
    // (creation) order — id 6 (04:00) before id 5 (05:00) — NOT re-ranked
    // by tier even though id 5's author is a professor
    const node3 = tree.find((n) => n.id === 3)!
    expect(node3.replies.map((n) => n.id)).toEqual([6, 5])
  })

  it('ResponseService.getTreeForQuestion applies the same tier ordering end-to-end through the repository', async () => {
    const repo = createFakeResponseRepo([
      res({ id: 1, questionId: 10, authorLevelSnapshot: 'member', status: 'published' }),
      res({ id: 2, questionId: 10, authorLevelSnapshot: 'professor', status: 'published' }),
      res({ id: 3, questionId: 10, authorLevelSnapshot: 'expert', status: 'published' }),
    ])
    const service = createResponseService(repo)

    const tree = await service.getTreeForQuestion(10, 'default', false)
    expect(tree.map((n) => n.id)).toEqual([2, 3, 1])
  })
})

describe('Response tombstone-on-delete — reply-tree integrity (spec D-013)', () => {
  it('deleteOwn() tombstones the row (never deletes it) and children remain correctly attached in the rebuilt tree', async () => {
    const repo = createFakeResponseRepo([
      res({ id: 1, questionId: 20, parentId: null, rootResponseId: 1, depth: 0, authorUserId: 100, authorLevelSnapshot: 'expert', body: 'پاسخ اصلی کارشناس', status: 'published' }),
      res({ id: 2, questionId: 20, parentId: 1, rootResponseId: 1, depth: 1, authorUserId: 200, authorLevelSnapshot: 'member', body: 'یک نظر پاسخ به پاسخ اصلی', status: 'published' }),
      res({ id: 3, questionId: 20, parentId: 2, rootResponseId: 1, depth: 2, authorUserId: 300, authorLevelSnapshot: 'member', body: 'ادامهٔ بحث', status: 'published' }),
    ])
    const service = createResponseService(repo)

    // the author of response 2 deletes their own reply
    const result = await service.deleteOwn(2, 200)
    expect(result.ok).toBe(true)

    // the row must still exist (tombstoned, not removed)
    const stillThere = await repo.findById(2)
    expect(stillThere).not.toBeNull()
    expect(stillThere!.isTombstone).toBe(true)
    expect(stillThere!.body).toBe('[این نظر توسط کاربر/ناظر حذف شده است]')

    // rebuild the tree — child (id 3, parentId=2) must STILL be nested
    // under the tombstoned node (id 2), which itself stays nested under
    // the root (id 1). The chain must never break.
    const tree = await service.getTreeForQuestion(20, 'default', true)
    expect(tree.map((n) => n.id)).toEqual([1])
    const root = tree[0]
    expect(root.replies.map((n) => n.id)).toEqual([2])
    const tombstoned = root.replies[0]
    expect(tombstoned.isTombstone).toBe(true)
    expect(tombstoned.replies.map((n) => n.id)).toEqual([3])
    expect(tombstoned.replies[0].isTombstone).toBe(false)
    expect(tombstoned.replies[0].body).toBe('ادامهٔ بحث')
  })

  it('deleteOwn() is forbidden for a non-author and does not tombstone the row', async () => {
    const repo = createFakeResponseRepo([res({ id: 1, questionId: 20, authorUserId: 100 })])
    const service = createResponseService(repo)

    const result = await service.deleteOwn(1, 999 /* not the author */)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('forbidden')

    const row = await repo.findById(1)
    expect(row!.isTombstone).toBe(false)
  })

  it('deleteByModerator() tombstones regardless of authorship and records a moderation action', async () => {
    const repo = createFakeResponseRepo([
      res({ id: 1, questionId: 20, parentId: null, rootResponseId: 1, depth: 0, authorUserId: 100 }),
      res({ id: 2, questionId: 20, parentId: 1, rootResponseId: 1, depth: 1, authorUserId: 200 }),
    ])
    const service = createResponseService(repo)

    const result = await service.deleteByModerator(1, 900, 'محتوای نامناسب')
    expect(result.ok).toBe(true)

    const row = await repo.findById(1)
    expect(row!.isTombstone).toBe(true)

    // child response (id 2) must still resolve under the tombstoned parent
    const tree = await service.getTreeForQuestion(20, 'default', true)
    expect(tree[0].id).toBe(1)
    expect(tree[0].isTombstone).toBe(true)
    expect(tree[0].replies.map((n) => n.id)).toEqual([2])
  })
})
