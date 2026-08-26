# Migration Guide: Cloudflare Workers → Traditional VPS (Laravel/Node/etc.)

This guide is written for a future engineer or AI system who has never
seen this project before. Read `architecture.md` first.

## 1. What has to change, and what doesn't

| Layer | Changes on migration? |
|---|---|
| `src/routes/*` (HTTP contracts) | No — becomes the spec for new Controllers |
| `src/services/*` (business logic) | Minimal — mostly a straight port (see §4) |
| `src/repositories/*` (Drizzle queries) | Rewritten against the new ORM (Eloquent, Prisma, etc.), same method signatures |
| `src/adapters/*` | Rewritten per adapter, same interface (see §5) |
| `src/db/schema/*` (Drizzle SQLite schema) | Translated to PostgreSQL migrations (see §2) |
| `wrangler.jsonc`, `src/lib/bindings.ts`, `src/db/client.ts` | Deleted / replaced entirely |

## 2. Database: D1 (SQLite) → PostgreSQL

1. Export the current schema + data using the built-in backup endpoint:
   `POST /admin/export/backup` (see `api.md` — requires
   `super_admin`). It emits one JSON file per table plus a
   `schema.sql` dump.
2. For each table in `src/db/schema/*.ts`, the mapping is mechanical
   because rule 3.2 was enforced throughout:
   - `integer('id').primaryKey({ autoIncrement: true })` → `bigserial PRIMARY KEY` (or `GENERATED ALWAYS AS IDENTITY`).
   - `text('...')` → `text` or `varchar` (no SQLite-specific `TEXT` quirks used).
   - `integer('flag', { mode: 'boolean' })` → `boolean`.
   - All `*_at` columns are ISO-8601 UTC strings → `timestamptz`, convertible with a straight `::timestamptz` cast.
   - `*_json` / `metadata_json` columns → keep as `jsonb` (recommended) or `text`.
   - Foreign keys (`.references(() => table.id)`) map directly to PostgreSQL `REFERENCES`.
3. Full table-by-table field list and notes: see `database-schema.md`.
4. Recreate indexes listed in each schema file's `(t) => ({...})` block as
   standard PostgreSQL `CREATE INDEX` statements.

## 3. ORM: Drizzle/D1 → Drizzle/Postgres (recommended) or Eloquent

- **Fastest path**: keep Drizzle, just swap the driver:
  `drizzle-orm/d1` → `drizzle-orm/node-postgres` (or `postgres-js`). The
  schema files in `src/db/schema/*.ts` are already dialect-agnostic table
  definitions except for the `sqlite-core` import — switch to `pg-core`
  column builders (`serial`, `boolean`, `timestamp`, `jsonb`) and the
  table definitions read almost 1:1.
- **Laravel path**: use the field mapping in `database-schema.md` to
  hand-write Eloquent migrations; `src/routes/*.ts` + `api.md` describe
  the exact request/response contracts each new Controller method must
  reproduce.

## 4. Business logic: `src/services/*`

These files have ZERO Cloudflare-specific imports by construction (rule
3.1). They take plain data in, return plain data out, and call
repository/adapter interfaces passed to them. Porting means:
- TypeScript target (Node/Bun): copy-paste, replace repository/adapter
  instances with the new concrete implementations.
- PHP/Laravel target: translate line-by-line into Laravel Service classes
  — the algorithms (response ranking, moderation state machine, OTP
  issuance rules, tool scoring) are the parts that must NOT change
  behavior; see `question-and-community-workflow.md` for the documented
  ranking algorithm and `moderation-and-safety.md` for the state machine.

## 5. Adapters: swap the concrete class, keep the interface

| Adapter interface | Cloudflare implementation | VPS replacement |
|---|---|---|
| `SmsAdapter` | `KavenegarSmsAdapter` (REST, unchanged) | Same class, no change needed |
| `StorageService` | `R2StorageService` | `S3StorageService` or `LocalFilesystemStorageService` |
| `PdfAdapter` | `BrowserRenderingPdfAdapter` (REST call to Cloudflare) | `PuppeteerPdfAdapter` (local Chromium) or `WeasyprintPdfAdapter` |

Each replacement class must implement the same interface file
(`*-adapter.interface.ts`) — no other code changes required.

## 6. Async jobs: Cloudflare Queues → Redis + worker process

- PDF generation and bulk notification sending are queued in this project
  (never done inline in a request handler, to respect Workers' CPU time
  limits). On a VPS, replace the Cloudflare Queue consumer with a
  Laravel Horizon queue worker (or BullMQ on Node) consuming the same
  job payload shape — see `api.md` for the job payload schemas.

## 7. Rate limiting / cache: D1 counters (or KV) → Redis

- MVP rate-limit counters live in dedicated D1 tables (see D-006 in
  `decisions.md`), which port to PostgreSQL directly like any other
  table. If KV was later added as a cache layer, replace with Redis using
  the same TTL semantics.

## 8. Step-by-step migration checklist

1. Stand up PostgreSQL + Redis on the new server.
2. Run the translated migrations (§2) to create the schema.
3. Run `POST /admin/export/backup` against the live Cloudflare deployment
   and import the JSON dumps into PostgreSQL.
4. Re-implement the 3 adapters (§5) for the new environment.
5. Re-implement `src/routes/*` as Controllers in the new framework,
   matching `api.md` exactly.
6. Point the queue consumer at Redis (§6).
7. Run the full Vitest/PHPUnit-equivalent suite (`testing.md`) against the
   new stack before cutting over DNS.
