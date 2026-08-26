/**
 * Domain: Identity, Auth, RBAC, User Restrictions, Notification Preferences
 *
 * PORTABILITY NOTE (see docs/database-schema.md):
 * - All timestamps are stored as ISO-8601 UTC strings (TEXT), never SQLite
 *   julian/unix-specific types. This maps 1:1 to PostgreSQL `timestamptz`.
 * - All booleans are stored as INTEGER (0/1) with drizzle's `boolean` mode,
 *   mapping 1:1 to PostgreSQL `boolean`.
 * - Primary keys are auto-incrementing INTEGER, mapping to PostgreSQL
 *   `serial`/`bigserial` or `identity` columns.
 * - No SQLite-only features (WITHOUT ROWID, STRICT tables, etc.) are used.
 */
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/** Core account. Auth is phone+OTP only in MVP (see docs/decisions.md). */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phoneNumber: text('phone_number').notNull().unique(), // E.164, e.g. +989121234567
  phoneVerifiedAt: text('phone_verified_at'),
  email: text('email').unique(), // optional, not used for login (spec 8.1)
  status: text('status').notNull().default('active'), // active | suspended | banned
  trustLevel: text('trust_level').notNull().default('new'), // new | trusted (spec 9.5)
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'), // soft delete
})

/** Display profile, separate from access role (spec 5.1: profile type != access role). */
export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  displayName: text('display_name').notNull(), // default: generated alias
  realName: text('real_name'),
  showRealName: integer('show_real_name', { mode: 'boolean' }).notNull().default(false),
  profileType: text('profile_type').notNull().default('other'), // father|mother|teacher|mentor|school_counselor|other
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  city: text('city'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
})

/** RBAC: roles catalog (member, expert, professor, moderator, scientific_manager, super_admin). */
export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  labelFa: text('label_fa').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** RBAC: fine-grained permission catalog. */
export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(), // e.g. question.moderate, professional.approve
  labelFa: text('label_fa').notNull(),
  group: text('group'), // content | question | response | professional | settings | audit
  createdAt: text('created_at').notNull().default(nowIso),
})

/** User <-> Role assignment (many-to-many). */
export const modelHasRoles = sqliteTable('model_has_roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  roleId: integer('role_id').notNull().references(() => roles.id),
  assignedAt: text('assigned_at').notNull().default(nowIso),
  assignedBy: integer('assigned_by').references(() => users.id),
}, (t) => ({
  uniqueUserRole: uniqueIndex('uq_model_has_roles_user_role').on(t.userId, t.roleId),
}))

/** Role -> Permission mapping. */
export const rolePermissions = sqliteTable('role_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roleId: integer('role_id').notNull().references(() => roles.id),
  permissionId: integer('permission_id').notNull().references(() => permissions.id),
}, (t) => ({
  uniqueRolePermission: uniqueIndex('uq_role_permissions').on(t.roleId, t.permissionId),
}))

/** Direct user -> permission override (Spatie-style "model_has_permissions"). */
export const modelHasPermissions = sqliteTable('model_has_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  permissionId: integer('permission_id').notNull().references(() => permissions.id),
  grantedAt: text('granted_at').notNull().default(nowIso),
  grantedBy: integer('granted_by').references(() => users.id),
}, (t) => ({
  uniqueUserPermission: uniqueIndex('uq_model_has_permissions').on(t.userId, t.permissionId),
}))

/**
 * OTP tokens. Code is ALWAYS stored hashed (spec 8.2, 14.1) — never plaintext.
 * Rate limiting counters live in KV (fast path); this table is the durable
 * audit trail (spec 14.3: OTP events must be logged).
 */
export const otpTokens = sqliteTable('otp_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phoneNumber: text('phone_number').notNull(),
  codeHash: text('code_hash').notNull(),
  purpose: text('purpose').notNull().default('login'), // login | verify
  ipAddress: text('ip_address'),
  deviceFingerprint: text('device_fingerprint'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  createdAt: text('created_at').notNull().default(nowIso),
}, (t) => ({
  phoneIdx: index('idx_otp_tokens_phone').on(t.phoneNumber),
}))

/** Moderator-imposed restrictions on a user (spec 5.2.E, 14.3). */
export const userRestrictions = sqliteTable('user_restrictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // temporary_limit | suspension | ban
  reason: text('reason'),
  imposedBy: integer('imposed_by').notNull().references(() => users.id),
  startsAt: text('starts_at').notNull().default(nowIso),
  endsAt: text('ends_at'),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Per-user notification channel preferences (spec 13.2). */
export const notificationPreferences = sqliteTable('notification_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  // JSON map: { "new_reply": true, "question_status_change": true, ... }
  prefsJson: text('prefs_json').notNull().default('{}'),
  updatedAt: text('updated_at'),
})
