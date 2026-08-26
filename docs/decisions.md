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
