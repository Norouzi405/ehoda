/**
 * Domain: Tool library (family media contract, phone-readiness checklist,
 * media-style quiz) and PDF export tracking (spec 11).
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/** Tool catalog, admin-editable (spec 12.1: "مدیریت ابزارها و قالب PDF"). */
export const tools = sqliteTable('tools', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // family_media_contract | phone_readiness_checklist | media_style_quiz
  titleFa: text('title_fa').notNull(),
  description: text('description'),
  pdfTemplateKey: text('pdf_template_key').notNull(), // maps to an adapter template id
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** A single user's submission/result for a tool, private by default (spec 14.2). */
export const toolSubmissions = sqliteTable('tool_submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolId: integer('tool_id').notNull().references(() => tools.id),
  userId: integer('user_id').references(() => users.id), // null allowed for anonymous preview
  answersJson: text('answers_json').notNull(),
  resultJson: text('result_json'), // computed output (agreement text / readiness verdict / quiz result)
  createdAt: text('created_at').notNull().default(nowIso),
})

/**
 * Generated PDF file record with expiring, signed download access
 * (spec 11.4: "لینک دانلود امن با زمان انقضا").
 */
export const pdfExports = sqliteTable('pdf_exports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolSubmissionId: integer('tool_submission_id').notNull().references(() => toolSubmissions.id),
  storageKey: text('storage_key').notNull(), // R2 object key (StorageService-abstracted)
  status: text('status').notNull().default('pending'), // pending|processing|ready|failed
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(nowIso),
})
