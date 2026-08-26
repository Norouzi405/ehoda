/**
 * Domain: Professor / Expert professional profiles and expertise taxonomy
 * (spec 10.1, 10.2)
 */
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/** Controlled vocabulary of expertise areas, editable from admin panel. */
export const expertiseAreas = sqliteTable('expertise_areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  labelFa: text('label_fa').notNull(),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Professional (professor|expert) identity, invitation and public profile. */
export const professionalProfiles = sqliteTable('professional_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  credentialType: text('credential_type').notNull(), // professor | expert
  status: text('status').notNull().default('invited'), // invited|pending_profile|active|suspended|inactive
  professionalTitle: text('professional_title'),
  shortBio: text('short_bio'),
  selectedBackground: text('selected_background'), // free text, curated bullet list
  selectedWorks: text('selected_works'), // free text
  monthlyCapacity: integer('monthly_capacity'), // internal capacity management
  publishedResponsesCount: integer('published_responses_count').notNull().default(0),
  conflictOfInterestNote: text('conflict_of_interest_note'),
  fastPublishEnabled: integer('fast_publish_enabled', { mode: 'boolean' }).notNull().default(false), // spec 9.5
  invitedBy: integer('invited_by').references(() => users.id),
  invitedAt: text('invited_at'),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: text('approved_at'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
})

/** Professional <-> ExpertiseArea (many-to-many). */
export const professionalExpertiseAreas = sqliteTable('professional_expertise_areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  professionalProfileId: integer('professional_profile_id').notNull().references(() => professionalProfiles.id),
  expertiseAreaId: integer('expertise_area_id').notNull().references(() => expertiseAreas.id),
}, (t) => ({
  uniquePair: uniqueIndex('uq_prof_expertise').on(t.professionalProfileId, t.expertiseAreaId),
}))
