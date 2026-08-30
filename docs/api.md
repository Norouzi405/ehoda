# API Reference (Portability Rule 3.4)

This is the authoritative contract for every HTTP endpoint. Any engineer
or AI system rebuilding this platform on another stack must reproduce
these exact request/response shapes — see `migration-guide-to-vps.md`.

> Status: Phase 1 (Content module + Auth/OTP) implemented and verified
> end-to-end against a local D1 database. Phase 2 (Questions/Responses)
> and Phase 3 (Tools/Admin export) sections below remain planned. This
> file is updated in the same commit as any route addition/change (never
> left to drift).

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

## Questions (planned, spec §9)

### `GET /api/questions`
Query params: `category`, `ageGroup`, `status` (public statuses only for
non-moderator sessions), `sort`, `q` (search), `page`.

### `POST /api/questions`
Auth: `member+`. Body matches the 3-step form (spec §9.2): classification
fields, raw text fields, `publicationChoice`, `consentAccepted`.

### `GET /api/questions/:slug`
Returns the question (public fields only, unless the session holds
`question.view_private`) + its top-level responses (see ranking below).

### `POST /api/questions/:id/responses`
Auth: `member+`. Body: `{ "body": "...", "parentId"?: number, "structuredMeta"?: {...} }`.

### `GET /api/questions/:id/responses?sort=default|newest|helpful|all`
Implements `rankResponses()` from `response-ranking.service.ts` —see
`roles-and-permissions.md` for the documented algorithm.

### `POST /api/responses/:id/vote` / `DELETE /api/responses/:id/vote`
Auth: any logged-in user. Enforces one vote per user per response
(`response_votes` unique index).

### `POST /api/responses/:id/report`
Body: `{ "reason": "insult|personal_info|advertising|dangerous_advice|off_topic|misinformation|other", "note"?: string }`.

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
