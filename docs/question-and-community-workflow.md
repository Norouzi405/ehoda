# Question & Community Workflow

## 1. Question status machine (spec §9.3)

```
draft ─▶ submitted ─▶ under_review ─┬─▶ approved ─▶ published ─▶ closed ─▶ archived
                        │            │
                        │            ├─▶ needs_more_info ─▶ submitted (loop)
                        │            ├─▶ needs_anonymization ─▶ under_review (loop, after moderator edit)
                        │            ├─▶ rejected  (terminal)
                        │            └─▶ private_referral (terminal for public visibility;
                        │                                   continues privately via question_assignments)
```

Every transition is written to `question_status_histories` with
`fromStatus`, `toStatus`, `changedBy`, `note` — this is the audit trail
consumed by the admin "average time to first review" report (spec §12.2).

Automatic sensitive-content flagging: on `submitted`, the raw text fields
are scanned against the admin-editable crisis keyword list
(`settings.crisis_keywords`); a match sets `isFlaggedSensitive = true`
and moves the question straight to `under_review` with top-of-queue
priority, regardless of the submitter's trust level. See
`moderation-and-safety.md`.

## 2. Response/reply status machine (spec §9.4)

```
draft ─▶ submitted ─┬─▶ under_review ─┬─▶ published
                     │                 ├─▶ rejected
                     │                 └─▶ hidden (post-publish, by moderator)
                     └─▶ published (post-moderation path, trusted users — see §3)

published ─▶ removed   (soft-delete/tombstone if it has replies, spec §9.7)
published ─▶ hidden    (moderator action, reversible via "restore")
```

## 3. Moderation policy (pre vs. post) — spec §9.5

| Author trust state | Default policy |
|---|---|
| New member (`users.trustLevel = 'new'`) | Pre-moderation (queued, `under_review`) |
| Trusted member (`trustLevel = 'trusted'`) | Post-moderation (published immediately, moderator can still hide) |
| Expert / Professor, `fastPublishEnabled = false` (default) | Pre-moderation |
| Expert / Professor, `fastPublishEnabled = true` (per-person toggle by scientific_manager) | Post-moderation |

Promotion `new → trusted` is automatic once a member has N published
responses with zero upheld reports (N configurable via
`settings.trust_promotion_threshold`, default 5) — implemented in
`TrustLevelService`, never a manual-only step, but always
moderator-reversible.

## 4. Threading rules (spec §9.7)

- `responses.parentId = NULL` → top-level answer to the question.
- `responses.parentId = <id>` → reply to that specific response.
- `rootResponseId` is set by `ResponseService.create()`:
  `rootResponseId = parentId ? parent.rootResponseId : newId`.
- `depth = parent ? parent.depth + 1 : 0`.
- UI renders `depth <= 2` inline; deeper replies collapse behind
  "نمایش پاسخ‌های بیشتر", loaded lazily by `rootResponseId`.
- Deleting a response (by its author OR by a moderator) never deletes the
  row: sets `isTombstone = true`, `body = '[این نظر توسط کاربر/ناظر حذف
  شده است]'` (single canonical string regardless of actor — D-013). The
  tree (`parentId`/`rootResponseId` chain) is untouched, so any existing
  replies keep rendering under the tombstoned parent.
- `hide` (moderator-only, `status → 'hidden'`) is a SEPARATE, reversible
  action from tombstone-on-delete: it removes the response from public
  listing without touching `body`/`isTombstone`, and can be undone via
  `unhide` (`status → 'published'`). Use `hide` for "temporarily pull this
  from view while I look into it"; use `delete` (tombstone) for a
  permanent removal that must still preserve the reply chain.
- Every response has a stable permalink: `/questions/{slug}#response-{id}`.

## 5. Default response ranking

See `roles-and-permissions.md` §"Default response ranking" — this is the
single canonical description of the algorithm; do not duplicate/diverge
the logic anywhere else in the codebase besides
`src/services/response-ranking.service.ts`.

## 6. Sanitization (XSS protection, spec §14.1)

All response/reply/question free-text bodies are:
1. Accepted as plain text or a minimal allow-listed Markdown subset
   (bold, italic, line breaks, links to *internal* content only).
2. Rendered server-side into sanitized HTML using an allow-list sanitizer
   (no `<script>`, no `on*` attributes, no external `<img>`/`<iframe>`).
3. Never rendered from raw user HTML input under any circumstance.

## 7. Structured expert/professor answer template (spec §9.9)

Stored in `responses.structuredMetaJson` as:
```json
{
  "problemSummary": "...",
  "importantNote": "...",
  "whatNotToDoNow": "...",
  "actionSteps": ["...", "..."],
  "suggestedConversationLine": "...",
  "referralSigns": "...",
  "relatedContentSlugs": ["..."]
}
```
The free-text `body` field remains available in parallel for
lighter-weight replies to a specific parent response (spec §9.9 "اگر
استاد ... صرفاً بخواهد ریپلای کند، UI سبک‌تر باشد").
