# Architecture — "خانواده و رسانه" (Family & Media)

## 1. Why Cloudflare Workers/Pages + Hono (and not Laravel)

The product brief's own §6.1 mandates the Laravel/PostgreSQL/Redis stack
*"unless a strong, documented technical reason justifies an alternative."*
This engineering environment's deployment tooling only targets Cloudflare
Workers/Pages (a V8-isolate runtime with no PHP interpreter, no persistent
processes, no filesystem). That is the documented reason. See
`decisions.md` §D-001 for the full record and client sign-off.

The client has additionally required (see `decisions.md` §D-007) that the
system be built under a **Migration-Ready & Portable Architecture**
principle: everything must be re-buildable on a traditional VPS
(Laravel/PostgreSQL/Redis or any other stack) by reading this repository
alone. That requirement drives most of the structural rules below.

## 2. Layering (Portability Rule 3.1)

```
Routes (Hono)  ─▶  Services (pure business logic, framework-agnostic)
                       │
                       ▼
                 Repositories (data access, Drizzle queries)
                       │
                       ▼
                 Adapters (SmsAdapter, StorageService, PdfAdapter)
```

Hard rules:
- **Routes** (`src/routes/*.ts`) only: parse/validate the HTTP request,
  call a Service method, shape the HTTP response. No SQL, no business
  rules, no adapter calls here.
- **Services** (`src/services/*.ts`) contain ALL business logic: response
  ranking, moderation workflow transitions, OTP issuance rules, tool
  scoring, PDF template assembly. Services receive their dependencies
  (a `Database` handle, a `SmsAdapter`, ...) as constructor/function
  arguments — see `src/lib/context.ts` — they never import
  `drizzle-orm/d1` or any `Cloudflare*` global type directly.
- **Repositories** (`src/repositories/*.ts`) are the only files allowed to
  write Drizzle queries. They accept a `Database` and return plain
  TypeScript objects/DTOs, never Drizzle's internal query builder types,
  to callers outside the repository layer.
- **Adapters** (`src/adapters/*/*.ts`) are the only files allowed to know
  about a specific external system (Cloudflare R2, Kavenegar's REST API,
  Cloudflare Browser Rendering's REST API). Each adapter implements a
  plain interface declared in `*.interface.ts` in the same folder.

The only files permitted to reference Cloudflare-specific types
(`D1Database`, `R2Bucket`, `Fetcher`) are:
`src/lib/bindings.ts`, `src/db/client.ts`, `src/adapters/**/*.ts` (the
concrete implementation files, not the `*.interface.ts` files), and
`src/lib/context.ts` (the DI container).

## 3. Request-scoped dependency injection

`src/lib/context.ts::buildAppContext(c)` is called once per Hono request
and returns `{ db, sms, storage, pdf, env }`. Every route handler calls
this once, then passes the relevant pieces into a Service call. This is
the seam that gets replaced when migrating off Cloudflare — see
`migration-guide-to-vps.md`.

## 4. Rendering strategy

- **Public content pages** (articles, question threads, tool intros): SSR
  via Hono JSX for SEO (see `src/renderer.tsx`, `src/components/*.tsx`).
- **Interactivity** (reply forms, expand/collapse threads, autosave,
  vote/report buttons): Alpine.js (CDN) progressively enhances the
  server-rendered HTML — no client-side SPA framework, no build-time
  hydration mismatch risk.
- **Admin panel**: same SSR approach, richer tables/filters, still no SPA.

## 5. Data storage mapping

| Concern | Cloudflare (current) | VPS equivalent (future) |
|---|---|---|
| Relational data | D1 (SQLite) | PostgreSQL |
| Rate-limit counters / cache | D1-backed counters (see `settings`/dedicated tables) or KV (BYOK only) | Redis |
| Async jobs (PDF generation, bulk notifications) | Cloudflare Queues | Redis + a worker process (Laravel Horizon-equivalent) |
| File storage | R2 | S3-compatible storage / local disk |
| PDF rendering | Cloudflare Browser Rendering (Chromium via REST API) | Puppeteer/Chromium or WeasyPrint |
| SMS OTP | Kavenegar REST API (unchanged either way) | Kavenegar REST API (unchanged) |

## 6. Directory layout

```
src/
  db/
    schema/         Drizzle schema, one file per domain (users, questions, ...)
    client.ts        createDb(d1) -> Database (the ONLY d1-aware file besides bindings.ts)
    migrations/      (drizzle-kit output lives in /migrations at repo root)
  routes/            Hono route handlers (thin, HTTP-only)
  services/          Business logic (framework-agnostic)
  repositories/       Drizzle-backed data access
  adapters/
    sms/             SmsAdapter interface + Kavenegar + Mock implementations
    storage/         StorageService interface + R2 implementation
    pdf/             PdfAdapter interface + Browser Rendering implementation
  middleware/        Hono middleware (auth, rbac, rate-limit)
  lib/               bindings.ts, context.ts, jalali date helpers, etc.
  components/        Hono JSX server components
docs/                This documentation set (kept up to date with every change)
migrations/          drizzle-kit generated SQL migrations (source of truth for schema)
seeders/             Seed scripts for demo/staging data
tests/               Vitest unit + integration tests
```

## 7. Non-functional requirements baked into the architecture

- **Least privilege / deny-by-default**: every sensitive route is wrapped
  by a `requirePermission('key')` middleware (see `roles-and-permissions.md`).
- **Audit logging**: any Service method that performs a sensitive action
  (role change, publish/hide/delete, professional approval, anonymization,
  referral, settings change, user restriction) MUST write a row to
  `audit_logs` in the same logical operation — see `moderation-and-safety.md`.
- **XSS protection**: response/reply bodies are sanitized server-side
  before storage (allow-list based) — raw HTML is never trusted, see
  `question-and-community-workflow.md` §Sanitization.
