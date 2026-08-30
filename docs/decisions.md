# Decisions Log

Each entry records what was decided, why, who decided it, and — where the
decision is a substitution for the stack requested in the original product
brief — exactly how to reverse/replace it during a VPS migration.

---

### D-001 — Stack substitution: Cloudflare Workers/Hono instead of Laravel/PHP
- **Context**: Product brief §6.1 mandates Laravel + PostgreSQL + Redis +
  Filament + Docker/Nginx/PHP-FPM.
- **Decision**: Implement on Cloudflare Workers/Pages + Hono (TypeScript) +
  D1 (SQLite) + Drizzle ORM + R2 + Cloudflare Queues + Cloudflare Browser
  Rendering, because the execution/deployment environment available for
  this engagement only supports the Cloudflare Workers runtime (no PHP
  interpreter, no persistent server process, no Docker).
- **Client sign-off**: Approved explicitly by the client in the second
  turn of the requirements conversation ("پیرو تحلیل فنی ارائه‌شده ...
  معماری پیشنهادی ... رسماً تأیید می‌شود").
- **Mitigation**: The client additionally required a **Migration-Ready &
  Portable Architecture** (see D-007). All business logic is written
  framework-agnostic; see `migration-guide-to-vps.md` for the reversal
  procedure.

### D-002 — SMS OTP provider: Kavenegar
- **Decision**: `KavenegarSmsAdapter` implements `SmsAdapter` using
  Kavenegar's Verify Lookup REST endpoint. `MockSmsAdapter` is used until
  `SMS_PROVIDER=kavenegar` and `KAVENEGAR_API_KEY` are configured.
- **Reversal on VPS**: No change needed — Kavenegar is a plain REST API,
  independent of the runtime.

### D-003 — Hosting/deploy target: client's own Cloudflare account (BYOK)
- **Decision**: Deployment goes through `wrangler` against the client's
  own Cloudflare account and API token (not the platform's managed
  Hosted Deploy). GitHub Actions will run `wrangler deploy` on merge to
  `main`.
- **Consequence**: `wrangler.jsonc` MAY use `kv_namespaces` if ever needed
  (Hosted Deploy's binding restriction — D1/R2 only — does not apply to
  BYOK). Not used in the MVP; see D-006.

### D-004 — Admin panel: server-rendered Hono JSX + Alpine.js, not a SPA
- **Decision**: Reproduce the Filament philosophy (fast form/table/filter
  authoring) with server-rendered pages instead of adopting a JS SPA
  framework, to keep the Worker bundle small and avoid a second frontend
  build pipeline.
- **Reversal on VPS**: Filament (Laravel/Livewire) can replace this layer
  directly; the underlying REST/data contracts (`docs/api.md`) stay valid.

### D-005 — PDF generation: Cloudflare Browser Rendering REST API
- **Decision**: `BrowserRenderingPdfAdapter` posts self-contained Persian
  RTL HTML (built by `pdf-template.service.ts`, Vazirmatn webfont) to
  `POST /accounts/{id}/browser-rendering/pdf` and returns PDF bytes.
- **Why REST API and not the Workers Binding**: identical code path from
  both Pages Functions and a future standalone Worker; trivially swappable
  for a local Puppeteer/Chromium call with the exact same
  `renderHtmlToPdf(html): Promise<ArrayBuffer>` signature.
- **Gate check**: a sample rendering was proven end-to-end via
  `GET /api/_gatecheck/pdf-sample` (see Gate Check §5). Awaiting the
  client's real Cloudflare `CLOUDFLARE_ACCOUNT_ID` +
  `CLOUDFLARE_API_TOKEN` (Browser Rendering: Edit permission) to confirm
  the final rendered output visually.
- **Reversal on VPS**: implement a `PuppeteerPdfAdapter` or
  `WeasyprintPdfAdapter` implementing the same `PdfAdapter` interface — no
  caller code changes.

### D-006 — No KV namespaces declared in `wrangler.jsonc` (yet)
- **Decision**: Even though this is a BYOK deploy (D-003) and KV would be
  allowed, the MVP schema uses D1-backed tables (`settings`, dedicated
  rate-limit counter tables) instead of KV, to keep a single source of
  truth that migrates cleanly to PostgreSQL. KV MAY be added later purely
  as a performance cache in front of D1, never as the source of truth.

### D-007 — Migration-Ready & Portable Architecture mandate
- **Context**: Client explicitly requires that any future engineer or AI
  system be able to read this repository and rebuild the platform on any
  other server/stack.
- **Decision**: Adopt the seven portability rules (see
  `architecture.md` §2 and the project instructions) as hard constraints
  on every subsequent commit: layered architecture, Postgres-compatible
  data modeling, a data export/backup endpoint, OpenAPI documentation,
  centralized `docs/`, adapter pattern for all external services, and CI
  test enforcement.

### D-008 — Rate limits (initial defaults, admin-editable)
- OTP: 3 attempts / 10 minutes per phone number + IP.
- New question submission: 5 / day per user.
- New response/reply: 20 / day per user.
- Stored in the `settings` table under key `rate_limits`, editable from
  the admin panel without a deploy.

### D-009 — CAPTCHA: Cloudflare Turnstile
- **Decision**: Enabled from day one on OTP request, question submission,
  and abuse report forms (free, Cloudflare-native, minimal UX friction).
- **Adapter pattern (portability rule 3.6)**: `CaptchaAdapter` interface
  with `TurnstileCaptchaAdapter` (real, posts to
  `https://challenges.cloudflare.com/turnstile/v0/siteverify`) and
  `MockCaptchaAdapter` (dev fallback, accepts any non-empty token).
  Selected by a factory (`createCaptchaAdapter(env)`) based on the
  presence of `TURNSTILE_SECRET_KEY` — identical pattern to `SmsAdapter`
  (D-008-adjacent) and `PdfAdapter` (D-005), so a VPS migration only needs
  a new concrete class, never a caller change.

### D-010 — Auth/OTP session design and phone normalization (Phase 1)
- **Session storage — hash only, never the raw token**: `sessions.tokenHash`
  stores only the SHA-256 hex digest of the session token; the raw token
  is set once in an HttpOnly/Secure/SameSite=Lax cookie and never persisted
  server-side. This mirrors the existing `otp_tokens.codeHash` pattern
  (the OTP code itself is never stored in the clear either). Session TTL
  is 30 days; `sessions.lastSeenAt` is touched on each resolved request.
- **Crypto primitives — Web Crypto API only**: `src/lib/crypto.ts`
  (`sha256Hex`, `randomHex`, `randomNumericCode`, `randomRequestId`,
  `randomSessionToken`, `timingSafeEqual`) uses exclusively `crypto.subtle`
  / `crypto.getRandomValues`. This is deliberate for portability: these
  Web Crypto APIs are natively available in both the Cloudflare Workers
  runtime *and* Node.js 19+, so this file requires zero changes on a VPS
  migration — unlike code built on Node's `require('crypto')`.
- **Iranian phone normalization**: `src/lib/phone.ts` accepts common raw
  input formats (`09121234567`, `9121234567`, `0098912...`, `+98912...`,
  Persian/Arabic-Indic digits) and normalizes to E.164 (`+989121234567`)
  before any DB write or SMS adapter call, so phone-number matching is
  never format-sensitive.
- **Rate limiting — D1 as single source of truth (extends D-006 to
  auth)**: OTP request rate limiting (3 attempts / 10 minutes per phone,
  60s resend cooldown) is implemented as a plain query against
  `otp_tokens` (via `OtpRepository.countRecentByPhone` /
  `findLatestByPhone`), not a separate KV/cache counter. Both thresholds
  are admin-editable via `settings.rate_limits` (D-008) without a deploy.
- **`OtpService`/`AuthService` testability — injectable clock**: both
  services accept an optional `clock: () => number = () => Date.now()`
  constructor argument so rate-limit windows, code expiry, and session TTL
  are deterministically unit-testable against fake repositories (see
  `tests/otp.service.test.ts`, `tests/auth.service.test.ts`) without any
  wall-clock sleeping in the test suite.

### D-011 — Local D1 dev persistence: explicit shared `--persist-to` path
- **Problem observed**: `wrangler d1 migrations apply ... --local` /
  `wrangler d1 execute ... --local` and `wrangler pages dev --d1=DB
  --local` (used by the PM2 dev process) each default to their own
  Durable Object storage directory. Without an explicit shared path they
  silently point at two *different* local SQLite files — migrations and
  seed data appeared to succeed, but the running dev server queried an
  empty database (`D1_ERROR: no such table: contents`).
- **Decision**: Every local D1 command (migrate, seed, console, and the
  `wrangler pages dev` invocation in `ecosystem.config.cjs`) now passes
  the identical flag `--persist-to=.wrangler/state`. Wrangler appends its
  own `v3/d1/...` subpath under this directory, so the value passed here
  must be the *parent* of the existing `.wrangler/state/v3` tree, not
  `.wrangler/state/v3` itself (an earlier attempt at
  `--persist-to=.wrangler/state/v3` produced a nested and equally-wrong
  `.wrangler/state/v3/v3/d1` directory).
- **Verification**: After aligning the flag and clearing the stale
  `.wrangler/state` directory once, `npm run db:migrate:local && npm run
  db:seed:local` followed by a PM2 restart produced consistent results —
  confirmed by directly inspecting the underlying `.sqlite` file with the
  `sqlite3` CLI (`SELECT count(*) FROM contents` returned 5, matching the
  seeder) and by all public routes returning HTTP 200 end-to-end.
- **Not applicable to production**: this entire class of problem is local
  `--local` dev-only; a real Cloudflare D1 database (`--remote` / actual
  deploy) has a single unambiguous storage location per `database_id`.
