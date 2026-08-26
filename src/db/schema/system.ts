/**
 * Domain: Notifications, Audit Log, Admin-editable Settings (spec 13, 14.3).
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // otp|question_status|new_response|new_reply|report_received|pdf_ready|...
  channel: text('channel').notNull(), // database|sms|email
  payloadJson: text('payload_json').notNull(),
  readAt: text('read_at'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  userIdx: index('idx_notifications_user').on(t.userId),
}))

/**
 * Immutable, append-only audit trail for every sensitive action listed in
 * spec 14.3 (role changes, professional approval, anonymization, referral,
 * publish/hide/delete/restore, settings changes, user restrictions...).
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorUserId: integer('actor_user_id').references(() => users.id), // null = system
  action: text('action').notNull(), // e.g. role.changed, professional.approved, response.hidden
  targetType: text('target_type'),
  targetId: integer('target_id'),
  ipAddress: text('ip_address'),
  metadataJson: text('metadata_json'), // JSON: before/after diff, reason, etc.
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  actionIdx: index('idx_audit_logs_action').on(t.action),
  targetIdx: index('idx_audit_logs_target').on(t.targetType, t.targetId),
}))

/**
 * Admin-editable key/value settings (rate limits, moderation policy toggles,
 * crisis-referral message templates, ranking algorithm parameters...).
 * Value is always JSON so any type can be represented without schema churn.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  valueJson: text('value_json').notNull(),
  description: text('description'),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: text('updated_at'),
  createdAt: text('created_at').notNull().default(nowIso),
})
