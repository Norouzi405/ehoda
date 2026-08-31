/**
 * Domain: Responses (answers/experiences) & Replies — the threaded core of
 * the Q&A community (spec 9.6, 9.7, 9.10, 15).
 *
 * Threading model:
 *   - parentId = NULL  -> top-level response to the question
 *   - parentId = N      -> reply to response N
 *   - rootResponseId    -> denormalized pointer to the top-level ancestor,
 *                          for O(1) subtree fetches without recursive CTEs
 *                          (kept consistent by the ResponseService, not DB
 *                          triggers, per the "no SQLite-specific behavior"
 *                          portability rule 3.2).
 *   - depth             -> materialized nesting depth, used by the UI to
 *                          decide when to collapse behind "نمایش پاسخ‌های
 *                          بیشتر" (max direct depth 2-3, spec 9.7).
 *   - authorLevelSnapshot -> the author's credibility tier AT THE TIME OF
 *                          PUBLISHING, frozen so that later role changes
 *                          never rewrite history (spec 15).
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { questions } from './questions'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/** author_level_snapshot values, centralized here for the ranking algorithm. */
export const AUTHOR_LEVELS = ['professor', 'expert', 'member_experience', 'member'] as const
export type AuthorLevel = typeof AUTHOR_LEVELS[number]

export const responses = sqliteTable('responses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionId: integer('question_id').notNull().references(() => questions.id),
  parentId: integer('parent_id'), // self-reference, NULL = top-level
  rootResponseId: integer('root_response_id'), // top-level ancestor id (self if top-level)
  depth: integer('depth').notNull().default(0),
  authorUserId: integer('author_user_id').notNull().references(() => users.id),

  /** Frozen credibility tier at publish time. Never recompute retroactively. */
  authorLevelSnapshot: text('author_level_snapshot').notNull(),

  body: text('body').notNull(), // sanitized, no raw HTML (spec 14.1 XSS protection)

  /** Structured optional fields for expert/professor answers (spec 9.9). */
  structuredMetaJson: text('structured_meta_json'), // JSON: { problemSummary, whatNotToDoNow, actionSteps, ... }

  status: text('status').notNull().default('submitted'),
  // draft|submitted|under_review|published|hidden|rejected|removed

  isEditorPick: integer('is_editor_pick', { mode: 'boolean' }).notNull().default(false),
  isScienceReviewed: integer('is_science_reviewed', { mode: 'boolean' }).notNull().default(false),

  helpfulVotesCount: integer('helpful_votes_count').notNull().default(0),

  /** Reply target's display name, preserved even if the target is later removed. */
  replyToDisplayName: text('reply_to_display_name'),

  editedAt: text('edited_at'),
  isTombstone: integer('is_tombstone', { mode: 'boolean' }).notNull().default(false), // soft-delete, preserves tree
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
}, (t) => ({
  questionParentIdx: index('idx_responses_question_parent').on(t.questionId, t.parentId),
  rootIdx: index('idx_responses_root').on(t.rootResponseId),
  statusIdx: index('idx_responses_status').on(t.status),
  authorIdx: index('idx_responses_author').on(t.authorUserId),
}))

/** Edit history snapshot, shown as "نمایش ویرایش‌شده" (spec 9.7). */
export const responseRevisions = sqliteTable('response_revisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  responseId: integer('response_id').notNull().references(() => responses.id),
  body: text('body').notNull(),
  editedBy: integer('edited_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** One "helpful" vote per (user, response) — enforced unique (spec 9.8, 15). */
export const responseVotes = sqliteTable('response_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  responseId: integer('response_id').notNull().references(() => responses.id),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  // D-012 fix: this MUST be a uniqueIndex (previously `index()`, a bug that
  // silently allowed duplicate votes since the DB constraint wasn't real).
  uniqueVote: uniqueIndex('uq_response_votes_user_response').on(t.responseId, t.userId),
}))

/** Abuse report against a response/reply (spec 9.8). */
export const responseReports = sqliteTable('response_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  responseId: integer('response_id').notNull().references(() => responses.id),
  reportedBy: integer('reported_by').notNull().references(() => users.id),
  reason: text('reason').notNull(), // insult|personal_info|advertising|dangerous_advice|off_topic|misinformation|other
  note: text('note'),
  status: text('status').notNull().default('open'), // open|reviewing|resolved|dismissed
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  statusIdx: index('idx_response_reports_status').on(t.status),
}))

/**
 * Generic moderation action log for questions AND responses (approve, hide,
 * reject, anonymize, restore, merge, refer...). Complements audit_logs with
 * moderation-domain-specific structure (spec 12.1, 14.3).
 */
export const moderationActions = sqliteTable('moderation_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  targetType: text('target_type').notNull(), // question | response
  targetId: integer('target_id').notNull(),
  action: text('action').notNull(), // approve|reject|hide|restore|anonymize|merge|refer|edit
  performedBy: integer('performed_by').notNull().references(() => users.id),
  reason: text('reason'),
  metadataJson: text('metadata_json'), // JSON, e.g. merge target id
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  targetIdx: index('idx_moderation_actions_target').on(t.targetType, t.targetId),
}))
