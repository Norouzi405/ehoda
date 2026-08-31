/**
 * Canonical response ranking algorithm (spec §2.2, §2.3, §9.3).
 * Documented in docs/roles-and-permissions.md — keep that doc in sync with
 * any change here. Pure function, zero I/O, trivially unit-testable and
 * trivially portable (no framework/Cloudflare dependency at all).
 */
import type { AuthorLevel } from '../db/schema/responses'

export type SortMode = 'default' | 'newest' | 'helpful' | 'all' | 'professionals_only' | 'parent_experience_only'

export interface RankableResponse {
  id: number
  authorLevelSnapshot: AuthorLevel | string
  isEditorPick: boolean
  helpfulVotesCount: number
  createdAt: string // ISO-8601 UTC
}

const LEVEL_RANK: Record<string, number> = {
  professor: 1,
  expert: 2,
  member_experience: 3,
  member: 4,
}

function levelRank(level: string): number {
  return LEVEL_RANK[level] ?? 999
}

/**
 * Ranks responses for display under a single question.
 *
 * - 'default': group by credibility tier (professor > expert >
 *   member_experience > member); a helpful-vote count NEVER moves a
 *   response out of its tier (spec §2.3 explicit requirement).
 * - 'newest' / 'helpful' / 'all': flatten tiers entirely, per the
 *   user-facing filter toggle (spec §9.7 "کاربر بتواند ترتیب را ... تغییر
 *   دهد").
 * - 'professionals_only': «فقط اساتید و کارشناسان» — filters to tiers
 *   professor+expert only, then applies the same tier/editor-pick/recency
 *   ordering as 'default' within that subset.
 * - 'parent_experience_only': «فقط تجارب والدین» — filters to the
 *   member_experience tier only, ordered editor-pick-first then recency.
 */
function defaultTierSort<T extends RankableResponse>(copy: T[]): T[] {
  return copy.sort((a, b) => {
    const tierDiff = levelRank(a.authorLevelSnapshot) - levelRank(b.authorLevelSnapshot)
    if (tierDiff !== 0) return tierDiff

    if (a.isEditorPick !== b.isEditorPick) return a.isEditorPick ? -1 : 1

    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  })
}

export function rankResponses<T extends RankableResponse>(responses: T[], mode: SortMode = 'default'): T[] {
  const copy = [...responses]

  if (mode === 'newest') {
    return copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }

  if (mode === 'helpful') {
    return copy.sort((a, b) => b.helpfulVotesCount - a.helpfulVotesCount)
  }

  if (mode === 'all') {
    return copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }

  if (mode === 'professionals_only') {
    const filtered = copy.filter((r) => r.authorLevelSnapshot === 'professor' || r.authorLevelSnapshot === 'expert')
    return defaultTierSort(filtered)
  }

  if (mode === 'parent_experience_only') {
    const filtered = copy.filter((r) => r.authorLevelSnapshot === 'member_experience')
    return defaultTierSort(filtered)
  }

  // default: tier first, editor pick second, then recency within tier.
  return defaultTierSort(copy)
}
