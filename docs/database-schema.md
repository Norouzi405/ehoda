# Database Schema

Source of truth: `src/db/schema/*.ts` (Drizzle) → generated SQL in
`/migrations/0000_*.sql`. This document is the human-readable ERD + the
PostgreSQL migration mapping required by Portability Rule 3.2.

> Regenerate migrations after any schema change: `npx drizzle-kit generate`

## Domain grouping

| File | Tables |
|---|---|
| `schema/users.ts` | users, profiles, roles, permissions, model_has_roles, role_permissions, model_has_permissions, otp_tokens, user_restrictions, notification_preferences |
| `schema/professionals.ts` | expertise_areas, professional_profiles, professional_expertise_areas |
| `schema/content.ts` | content_categories, content_tags, age_groups, contents, content_tag_links, related_contents, content_revisions, content_sources |
| `schema/questions.ts` | questions, question_versions, question_status_histories, question_assignments, question_internal_notes |
| `schema/responses.ts` | responses, response_revisions, response_votes, response_reports, moderation_actions |
| `schema/tools.ts` | tools, tool_submissions, pdf_exports |
| `schema/system.ts` | notifications, audit_logs, settings |

## Cross-dialect type mapping (SQLite/D1 ↔ PostgreSQL)

| Drizzle SQLite builder | Current D1 column | PostgreSQL equivalent |
|---|---|---|
| `integer('id').primaryKey({ autoIncrement: true })` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `bigserial PRIMARY KEY` |
| `text('col')` | `TEXT` | `text` |
| `integer('flag', { mode: 'boolean' })` | `INTEGER` (0/1) | `boolean` |
| `text('x_at')` (ISO-8601 UTC string) | `TEXT` | `timestamptz` |
| `text('x_json')` | `TEXT` (JSON string) | `jsonb` (recommended) |
| `.references(() => table.id)` | `FOREIGN KEY` | `REFERENCES` (unchanged) |
| `uniqueIndex(...)` / `index(...)` | `UNIQUE INDEX` / `INDEX` | `CREATE UNIQUE INDEX` / `CREATE INDEX` (unchanged) |

No SQLite-only features are used anywhere (no `WITHOUT ROWID`, no `STRICT`
tables, no SQLite-specific pragmas relied upon by application logic).

## The threaded `responses` table — key to the whole product

```
responses
├── id
├── question_id        -> questions.id
├── parent_id           -> responses.id (NULL = top-level answer)
├── root_response_id    -> responses.id (denormalized top-level ancestor, self if top-level)
├── depth                (0 = top-level; UI collapses beyond 2-3)
├── author_user_id      -> users.id
├── author_level_snapshot  ('professor'|'expert'|'member_experience'|'member') — FROZEN at publish time
├── body
├── structured_meta_json  (expert/professor structured answer fields)
├── status               (draft|submitted|under_review|published|hidden|rejected|removed)
├── is_editor_pick
├── is_science_reviewed
├── helpful_votes_count
├── reply_to_display_name
├── edited_at
├── is_tombstone         (soft delete that preserves tree structure)
└── published_at / created_at / updated_at
```

Design rationale:
- `root_response_id` lets the UI fetch an entire reply subtree in one
  indexed query (`WHERE root_response_id = ?`) instead of a recursive CTE
  — SQLite/D1 recursive CTEs are supported but slower to reason about and
  harder to port; this keeps the query trivially portable to PostgreSQL
  too.
- `author_level_snapshot` is written once, at publish time, by
  `ResponseService.publish()`. It is NEVER recomputed from the user's
  current role — this is what guarantees historical ranking stability
  when a user's role changes later (spec §15).
- `is_tombstone` + a placeholder body string is how deletion is
  implemented for any response with existing replies, so the thread
  structure never breaks (spec §9.7).

## Full-text search (MVP)

MVP search uses SQLite FTS5 virtual tables (external content tables
pointing at `contents.body` / `questions.public_body`), added as a
separate migration once content authoring begins. This satisfies spec
§6.1's "database search acceptable at first, but the interface must be
upgradable" — the search Service exposes a single `search(query, filters)`
method; swapping the implementation for Meilisearch/Postgres
`tsvector` later requires no caller changes.
