import { describe, it, expect } from 'vitest'
import { rankResponses, type RankableResponse } from '../src/services/response-ranking.service'

/**
 * Spec §16.1 critical acceptance tests:
 *  - default order follows author_level_snapshot tier (professor > expert
 *    > member_experience > member)
 *  - a helpful-vote count can NEVER move a lower-tier response above a
 *    higher-tier one in the default sort
 */
function r(overrides: Partial<RankableResponse>): RankableResponse {
  return {
    id: overrides.id ?? 1,
    authorLevelSnapshot: overrides.authorLevelSnapshot ?? 'member',
    isEditorPick: overrides.isEditorPick ?? false,
    helpfulVotesCount: overrides.helpfulVotesCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('rankResponses (default sort)', () => {
  it('orders professor > expert > member_experience > member', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member' }),
      r({ id: 2, authorLevelSnapshot: 'professor' }),
      r({ id: 3, authorLevelSnapshot: 'member_experience' }),
      r({ id: 4, authorLevelSnapshot: 'expert' }),
    ]
    const ranked = rankResponses(input, 'default')
    expect(ranked.map((x) => x.id)).toEqual([2, 4, 3, 1])
  })

  it('a high helpful-vote count never lifts a member above a professor', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member', helpfulVotesCount: 500 }),
      r({ id: 2, authorLevelSnapshot: 'professor', helpfulVotesCount: 0 }),
    ]
    const ranked = rankResponses(input, 'default')
    expect(ranked[0].id).toBe(2)
    expect(ranked[1].id).toBe(1)
  })

  it('within the same tier, editor pick is surfaced first', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'expert', isEditorPick: false, createdAt: '2026-01-02T00:00:00.000Z' }),
      r({ id: 2, authorLevelSnapshot: 'expert', isEditorPick: true, createdAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const ranked = rankResponses(input, 'default')
    expect(ranked[0].id).toBe(2)
  })

  it('"newest" sort ignores tier grouping entirely', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member', createdAt: '2026-01-03T00:00:00.000Z' }),
      r({ id: 2, authorLevelSnapshot: 'professor', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const ranked = rankResponses(input, 'newest')
    expect(ranked[0].id).toBe(1)
  })

  it('"helpful" sort ignores tier grouping entirely', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member', helpfulVotesCount: 10 }),
      r({ id: 2, authorLevelSnapshot: 'professor', helpfulVotesCount: 1 }),
    ]
    const ranked = rankResponses(input, 'helpful')
    expect(ranked[0].id).toBe(1)
  })

  it('"professionals_only" filters to professor+expert and keeps professor > expert', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member' }),
      r({ id: 2, authorLevelSnapshot: 'expert' }),
      r({ id: 3, authorLevelSnapshot: 'member_experience' }),
      r({ id: 4, authorLevelSnapshot: 'professor' }),
    ]
    const ranked = rankResponses(input, 'professionals_only')
    expect(ranked.map((x) => x.id)).toEqual([4, 2])
  })

  it('"parent_experience_only" filters to member_experience tier only', () => {
    const input = [
      r({ id: 1, authorLevelSnapshot: 'member' }),
      r({ id: 2, authorLevelSnapshot: 'expert' }),
      r({ id: 3, authorLevelSnapshot: 'member_experience', createdAt: '2026-01-01T00:00:00.000Z' }),
      r({ id: 4, authorLevelSnapshot: 'professor' }),
      r({ id: 5, authorLevelSnapshot: 'member_experience', isEditorPick: true, createdAt: '2025-12-01T00:00:00.000Z' }),
    ]
    const ranked = rankResponses(input, 'parent_experience_only')
    // editor pick surfaces first even though it's older
    expect(ranked.map((x) => x.id)).toEqual([5, 3])
  })
})
