# API Reference (Portability Rule 3.4)

This is the authoritative contract for every HTTP endpoint. Any engineer
or AI system rebuilding this platform on another stack must reproduce
these exact request/response shapes — see `migration-guide-to-vps.md`.

> Status: Phase 1 (Content module + Auth/OTP) and Phase 2 (پرسش‌کدهٔ
> خانواده و رسانه — Questions/Responses/Moderation/Cartable) implemented
> and verified end-to-end against a local D1 database, including seeded
> realistic Q&A threads. Phase 3 (Tools/Admin export) section below
> remains planned. This file is updated in the same commit as any route
> addition/change (never left to drift).

## Conventions

- All request/response bodies are JSON, UTF-8, unless noted.
- All timestamps in responses are ISO-8601 UTC strings; the client is
  responsible for Jalali conversion for display (server never sends
  pre-formatted Jalali strings in API payloads).
- Authentication: session cookie set after OTP verification (HttpOnly,
  Secure, SameSite=Lax). No bearer tokens in MVP.
- Errors: `{ "error": "<machine_key>", "message"?: string, ... }` with an
  appropriate 4xx/5xx status code.

## Auth

### `POST /api/auth/otp/request`
Request body: `{ "phoneNumber": "+989121234567" }`
Response: `{ "requestId": "...", "cooldownSeconds": 60 }`
Rate limit: 3 / 10min per phone+IP (D-008). Also gated by Turnstile token
(D-009) in the request body: `{ "turnstileToken": "..." }`.

### `POST /api/auth/otp/verify`
Request body: `{ "requestId": "...", "code": "123456" }`
Response: `{ "userId": 123, "isNewUser": true }` + sets session cookie.
Error codes: `not_found`, `expired`, `already_consumed`,
`too_many_attempts` (5 max), `invalid_code`.

### `POST /api/auth/logout`
Auth: session cookie (if present). Revokes the session server-side
(`sessions` row deleted) and clears the cookie. Always returns `{ "ok": true }`.

### `GET /api/auth/me`
Auth: session cookie required. Response:
`{ "id": number, "phoneNumber": string, "trustLevel": string, "status": string }`.
401 `{ "error": "unauthenticated" }` if no valid session.

## Content (Phase 1, implemented)

### `GET /api/contents`
Query params: `category` (slug, optional), `page` (default 1, 1-indexed).
Only `status = 'published'` rows are returned. Response:
`{ "items": ContentListItem[], "total": number, "page": number, "pageSize": number }`.
Page size is server-clamped to (1, 50], default 12.

### `GET /api/contents/:slug`
Returns full article detail (joins category + age group) — 404
`{ "error": "not_found" }` if missing or not published.

### `GET /api/categories`
Returns active content categories ordered by `sortOrder`.

Corresponding server-rendered (SSR, D-004) pages exist at the same paths
without the `/api` prefix: `GET /contents`, `GET /contents/:slug`, plus
`GET /login` (2-step OTP UI) and `GET /` (homepage with latest content).

## Gate-check technical proof

### `GET /api/_gatecheck/pdf-sample`
Renders a sample Persian/RTL "Family Media Contract" document through the
`PdfAdapter` and streams back `application/pdf`. No auth required —
temporary diagnostic route, removed once the real tool-submission PDF flow
(§Tools below) is implemented.

### `GET /api/_gatecheck/last-otp/:phone`
Diagnostic-only route (`src/routes/dev-tools.ts`) so the client can
complete a REAL phone+OTP login on the sandbox preview without a live
Kavenegar SMS inbox. Returns the last OTP code issued to `:phone` by
`MockSmsAdapter`: `{ "phoneNumber": "+989...", "code": "123456", "note": "..." }`.
404 `{ "error": "not_found" }` if no code was requested yet, 400
`{ "error": "invalid_phone_number" }` for a malformed number.
**Safety gate**: this route ALWAYS returns 404 the moment
`SMS_PROVIDER === 'kavenegar'` AND a real `KAVENEGAR_API_KEY` secret is
configured — i.e. it is structurally incapable of leaking an OTP code in
any environment using the real SMS provider, only in local/sandbox Mock
mode. Not part of the portable API contract — omit when reproducing this
platform on another stack.

## پرسش‌کدهٔ خانواده و رسانه — Questions & Responses (Phase 2, implemented, spec §2/§9)

> **قاعدهٔ نام‌گذاری الزامی**: تنها عبارت مجاز برای این ماژول در همهٔ
> مسیرها، متن رابط کاربری و مستندات «پرسش‌کده» است. عبارت منسوخ/ممنوع
> «پرسش‌خانه» هرگز نباید در هیچ‌جا ظاهر شود.

Implemented in `src/routes/porseshkadeh.api.ts` (JSON, mounted under
`/api`) with an SSR counterpart at `src/routes/porseshkadeh.pages.tsx`
(same paths, no `/api` prefix) — both call the exact same
`QuestionService` / `ResponseService` (portability rule 3.1, no logic
duplication, D-004).

### `GET /api/porseshkadeh`
Query params: `category` (slug), `age_group` (slug), `page` (1-indexed).
Only `status = 'published'` questions are returned, with their
moderator-curated `publicTitle`/`publicBody` — never raw/private fields.
Response: `{ "items": QuestionListItem[], "total": number, "page": number, "pageSize": number }`.

### `GET /api/porseshkadeh/taxonomy`
Returns `{ "categories": [...], "ageGroups": [...] }` for populating the
question wizard's classification step.

### `POST /api/porseshkadeh`
Auth: session cookie required (`member+`). Body (multi-step wizard, spec
§9.2):
```json
{
  "authorRole": "father|mother|teacher|mentor|school_counselor|other",
  "contextSpace": "home|school|couple",
  "ageGroupSlug": "...",
  "categorySlug": "...",
  "isRecurring": false,
  "urgencyLevel": "normal|concerning|urgent",
  "rawTitle": "... (min 3 chars)",
  "rawWhatHappened": "... (min 50 chars)",
  "rawSinceWhen": "...",
  "rawTriedSoFar": "...",
  "rawHelpRequested": "...",
  "publicationChoice": "publish_after_anonymization|private_referral_only",
  "turnstileToken": "..."
}
```
Response: `{ "slug": "...", "status": "submitted|private_referral", "isCrisis": boolean }`.

**Crisis Triage Filter (spec §9.11, mandatory, non-bypassable):** before
persisting, the raw text fields are scanned against the admin-editable
`crisis_keywords` setting (`DEFAULT_CRISIS_KEYWORDS` fallback if unset/
empty — see `crisis-triage.service.ts`). A match FORCES
`status = 'private_referral'` regardless of the author's own
`publicationChoice`, and the question is flagged
(`isFlaggedSensitive = true`, matched terms recorded in
`flaggedKeywords`) so it never enters the normal public moderation queue.
403/400 on validation errors: `{ "error": "validation_error", "message": "..." }`.
401 `{ "error": "unauthenticated" }` if no session. 400
`{ "error": "captcha_failed" }` if the Turnstile token fails.

### `GET /api/porseshkadeh/:slug`
Returns `{ "question": QuestionDetail, "responses": ResponseTreeNode[] }`.
Only `published` questions are resolvable here (raw/private fields are
never included — use the SSR cartable/moderation views, which are
permission-gated, for the raw record). `?sort=default|newest|helpful|all`
selects the top-level ranking mode (see Roles/Permissions doc for the
algorithm). 404 `{ "error": "not_found" }` if missing/unpublished.

### `POST /api/porseshkadeh/:slug/responses`
Auth: `member+`. Body:
```json
{ "parentId"?: number, "body": "... (min 2 chars)", "structuredMetaJson"?: "...", "replyToDisplayName"?: "...", "asExperience"?: boolean }
```
The author's `authorLevelSnapshot` is computed server-side and frozen at
creation time (never recomputed later, even if the user's role changes
afterwards):
- `professor` / `expert` — if the author has an active
  `professional_profiles` row (`credentialType`); pre-moderation is
  skipped only when `fastPublishEnabled` is set on that profile.
- `member_experience` — a plain member's **top-level** answer (not a
  reply) with `asExperience: true` ("این یک تجربهٔ شخصی من به‌عنوان
  والد/مربی است").
- `member` — everything else (including all replies, regardless of the
  `asExperience` flag).

Response: `{ "id": number, "status": "published|under_review" }`.
401/400 as above.

### `POST /api/porseshkadeh/responses/:id/vote`
Auth: any logged-in user. Enforces one "مفید بود" vote per user per
response (`response_votes` unique index). 409
`{ "error": "already_voted" }`, 404 `{ "error": "not_found" }`.

### `POST /api/porseshkadeh/responses/:id/report`
Body: `{ "reason": "insult|personal_info|advertising|dangerous_advice|off_topic|misinformation|other", "note"?: string }`.

### `DELETE /api/porseshkadeh/responses/:id`
Auth: the response's own author only (403 otherwise). **Tombstone-on-delete
(spec §2.3/D-013):** the row is never physically removed — `is_tombstone`
is set and `body` is replaced with the canonical placeholder text
`"[این نظر توسط کاربر/ناظر حذف شده است]"`, so any replies nested under it
(`parentId` chain) remain intact and correctly rendered. 404
`{ "error": "not_found" }`, 403 `{ "error": "forbidden" }`.

### Professional cartable (spec §2.4)

- `GET /api/porseshkadeh/cartable/assigned` — questions a moderator
  explicitly referred to this professional user.
- `GET /api/porseshkadeh/cartable/expertise` — published questions in
  this professional's expertise-area categories (excludes their own
  questions). Empty result if the caller has no active professional
  profile.
- `POST /api/porseshkadeh/cartable/draft` — body
  `{ "questionId": number, "body": "...", "structuredMetaJson"?: "..." }`;
  requires an active professional profile (403 otherwise); upserts the
  author's in-progress structured draft for that question.
- `POST /api/porseshkadeh/cartable/draft/:id/submit` — submits a saved
  draft for publication/review (goes straight to `published` only when
  `fastPublishEnabled` is set on the profile).

### Moderation (permission-gated, `requirePermission()`, deny-by-default)

- `GET /api/admin/moderation/questions` — requires `question.moderate`.
  Query: `status`, `page`.
- `POST /api/admin/moderation/questions/:id` — requires
  `question.moderate`. Body:
  `{ "action": "approve_publish|refer|reject|crisis_referral|anonymize_edit", "publicTitle"?, "publicBody"?, "categorySlug"?, "ageGroupSlug"?, "reason"?, "professionalUserId"?, "note"? }`.
- `GET /api/admin/moderation/responses` — requires `response.moderate`.
- `POST /api/admin/moderation/responses/:id` — requires
  `response.moderate`. Body:
  `{ "action": "approve|reject|hide|unhide|delete|editor_pick|unset_editor_pick|science_reviewed|unset_science_reviewed", "reason"? }`.
  `hide` (reversible, `status = 'hidden'`) is intentionally distinct from
  `delete` (irreversible tombstone-on-delete, body replaced, row/replies
  preserved — see `docs/moderation-and-safety.md` §3).
- `GET /api/admin/moderation/reports` — requires
  `moderation.resolve_report`.
- `POST /api/admin/moderation/reports/:id` — requires
  `moderation.resolve_report`. Body:
  `{ "status": "resolved|dismissed", "penalty"?: "none|delete_comment|warn_user|suspend_user", "suspendDays"?: number }`.
  `warn_user`/`suspend_user` additionally require the stronger
  `moderation.restrict_user` permission — 403
  `{ "error": "forbidden", "required_permission": "moderation.restrict_user" }`
  if the caller only holds `moderation.resolve_report`.

Corresponding SSR pages (same business logic, human-facing HTML) exist at
`GET /porseshkadeh` (list), `GET /porseshkadeh/ask` (wizard),
`GET /porseshkadeh/crisis-help` (static crisis-resources page),
`GET /porseshkadeh/:slug` (detail + thread), `GET /porseshkadeh/cartable`
and `GET /porseshkadeh/cartable/respond/:questionId` (professional
cartable), and `GET /admin/moderation/{questions,responses,reports}`
(moderation queues).

## Tools (planned, spec §11)

### `POST /api/tools/:slug/submit`
Auth required for saving + PDF; anonymous preview allowed without saving.
Body: tool-specific answers JSON. Response: `{ "submissionId": number, "result": {...} }`.

### `GET /api/tools/submissions/:id/pdf`
Returns a signed, time-limited redirect to the R2-stored PDF (see
`R2StorageService.getSignedUrl`). 403 if the requester is not the owner or
an authorized admin.

## Admin / data portability (spec §12, portability rule 3.3)

### `POST /admin/export/backup`
Auth: `super_admin` only. Triggers a full data export (JSON per table +
`schema.sql`) to R2 and returns a signed download URL. See
`migration-guide-to-vps.md` §2.

---

Full OpenAPI/JSON-Schema generation (`docs/api.json`) will be added once
the route surface stabilizes past the Gate Check — tracked in
`decisions.md`.
