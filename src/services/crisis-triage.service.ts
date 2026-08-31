/**
 * Crisis Triage Filter (Phase 2, spec §9.11 / موجود در docs/moderation-and-safety.md §1-2).
 *
 * Pure function, zero I/O — the keyword list itself is admin-editable data
 * (`settings.crisis_keywords`, see SettingsRepository) fetched by the
 * caller (QuestionService) and passed in here. This keeps the matching
 * logic trivially unit-testable and fully portable (rule 3.1).
 *
 * IMPORTANT: this is explicitly a first-pass heuristic filter, NOT a
 * clinical/legal determination (documented to the ops team in
 * docs/moderation-and-safety.md §2). A match only:
 *   1. Sets questions.isFlaggedSensitive = true
 *   2. Records the matched keyword(s) in questions.flaggedKeywords (audit trail)
 *   3. Forces questions.status = 'private_referral' and skips the public
 *      submission/moderation queue entirely
 *   4. Is written to moderation_actions / audit_logs by the caller
 */

/** Default crisis keyword list (Persian), also seeded into settings.crisis_keywords. */
export const DEFAULT_CRISIS_KEYWORDS = [
  'خودکشی',
  'خودکشي',
  'خودآسیبی',
  'خودآسیب‌رسانی',
  'آزار جنسی',
  'سوءاستفاده جنسی',
  'تجاوز',
  'خشونت فیزیکی شدید',
  'باج‌گیری',
  'باج گیری',
  'اخاذی اینترنتی',
  'اخاذی',
]

export interface CrisisTriageResult {
  isFlagged: boolean
  matchedKeywords: string[]
}

/**
 * Normalizes text for matching: strips ZWNJ/diacritics variance and
 * lower-cases (Persian has no case, but this is harmless and future-proofs
 * any Latin crisis terms added later).
 */
function normalizeForMatch(text: string): string {
  return text.replace(/\u200c/g, '').replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Checks a set of free-text fields against the crisis keyword list.
 * Returns every matched keyword (for the audit trail), not just the first.
 */
export function runCrisisTriage(texts: (string | null | undefined)[], keywords: string[]): CrisisTriageResult {
  const haystack = normalizeForMatch(texts.filter(Boolean).join(' \n '))
  const matched = keywords.filter((kw) => kw && haystack.includes(normalizeForMatch(kw)))
  return { isFlagged: matched.length > 0, matchedKeywords: matched }
}
