/**
 * Domain: Questions (Q&A intake, classification, status machine, referral)
 * (spec 9.2, 9.3, 9.11)
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { contentCategories, ageGroups } from './content'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/**
 * Question. Stores BOTH the private raw submission and the public,
 * anonymized version (spec 15 note: "نسخه خصوصی اصلی و نسخه پالایش‌شده
 * عمومی قابل تفکیک باشد"). The raw fields are only readable by users
 * holding the `question.view_private` permission (moderators+).
 */
export const questions = sqliteTable('questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  authorUserId: integer('author_user_id').notNull().references(() => users.id),

  // --- classification (spec 9.2 step 1) ---
  authorRole: text('author_role'), // father|mother|teacher|mentor|school_counselor|other
  contextSpace: text('context_space'), // home|school|couple
  ageGroupId: integer('age_group_id').references(() => ageGroups.id),
  categoryId: integer('category_id').references(() => contentCategories.id),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  urgencyLevel: text('urgency_level').notNull().default('normal'), // normal|concerning|urgent

  // --- raw private submission (spec 9.2 step 2) ---
  rawTitle: text('raw_title').notNull(),
  rawWhatHappened: text('raw_what_happened').notNull(),
  rawSinceWhen: text('raw_since_when'),
  rawTriedSoFar: text('raw_tried_so_far'),
  rawHelpRequested: text('raw_help_requested'),

  // --- public, moderator-curated version ---
  publicTitle: text('public_title'),
  publicBody: text('public_body'),
  isAnonymized: integer('is_anonymized', { mode: 'boolean' }).notNull().default(false),

  // --- consent (spec 9.2 step 3) ---
  publicationChoice: text('publication_choice').notNull().default('publish_after_anonymization'),
  // publish_after_anonymization | private_referral_only
  consentAcceptedAt: text('consent_accepted_at'),

  // --- status machine (spec 9.3) ---
  status: text('status').notNull().default('draft'),
  // draft|submitted|needs_more_info|under_review|needs_anonymization|
  // rejected|private_referral|approved|published|closed|archived

  isFlaggedSensitive: integer('is_flagged_sensitive', { mode: 'boolean' }).notNull().default(false),
  flaggedKeywords: text('flagged_keywords'), // JSON array, audit trail of auto-detection

  viewsCount: integer('views_count').notNull().default(0),
  publishedAt: text('published_at'),
  closedAt: text('closed_at'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
}, (t) => ({
  statusIdx: index('idx_questions_status').on(t.status),
  authorIdx: index('idx_questions_author').on(t.authorUserId),
  categoryIdx: index('idx_questions_category').on(t.categoryId),
}))

/** Immutable snapshot every time a question's content is edited (audit trail). */
export const questionVersions = sqliteTable('question_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionId: integer('question_id').notNull().references(() => questions.id),
  snapshotJson: text('snapshot_json').notNull(), // full field snapshot as JSON
  editedBy: integer('edited_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Every status transition, who did it and why (spec 14.3 audit requirement). */
export const questionStatusHistories = sqliteTable('question_status_histories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionId: integer('question_id').notNull().references(() => questions.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedBy: integer('changed_by').references(() => users.id),
  note: text('note'),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Moderator/scientific-manager referral of a question to a professional. */
export const questionAssignments = sqliteTable('question_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionId: integer('question_id').notNull().references(() => questions.id),
  assignedToUserId: integer('assigned_to_user_id').notNull().references(() => users.id),
  assignedBy: integer('assigned_by').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending|accepted|declined|completed
  note: text('note'),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Internal-only notes visible to moderators/scientific managers, never to public. */
export const questionInternalNotes = sqliteTable('question_internal_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionId: integer('question_id').notNull().references(() => questions.id),
  authorUserId: integer('author_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(nowIso),
})
