/**
 * Domain: Public reference content (articles/guides), categories, tags,
 * age groups (spec 7.2, 7.3)
 */
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/** Editable content category taxonomy (admin-managed, spec: "قابل مدیریت از پنل"). */
export const contentCategories = sqliteTable('content_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  nameFa: text('name_fa').notNull(),
  description: text('description'),
  parentId: integer('parent_id'), // self-reference for nested categories
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(nowIso),
})

export const contentTags = sqliteTable('content_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  nameFa: text('name_fa').notNull(),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Age-group taxonomy used across content, questions and tools. */
export const ageGroups = sqliteTable('age_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(), // under_6 | 6_9 | 9_12 | 12_15 | 15_18 | other
  labelFa: text('label_fa').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
})

/** Reference article / guide (spec 7.3). */
export const contents = sqliteTable('contents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  shortAnswer: text('short_answer'), // "پاسخ کوتاه در ابتدای محتوا"
  body: text('body').notNull(), // sanitized HTML/Markdown
  coverImageUrl: text('cover_image_url'),
  authorUserId: integer('author_user_id').references(() => users.id),
  categoryId: integer('category_id').references(() => contentCategories.id),
  ageGroupId: integer('age_group_id').references(() => ageGroups.id),
  audience: text('audience'), // parent | teacher | mentor | all
  status: text('status').notNull().default('draft'), // draft|in_review|published|archived
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  ogImageUrl: text('og_image_url'),
  ctaType: text('cta_type'), // tool | question | content
  ctaTargetSlug: text('cta_target_slug'),
  publishedAt: text('published_at'),
  lastReviewedAt: text('last_reviewed_at'),
  createdAt: text('created_at').notNull().default(nowIso),
  updatedAt: text('updated_at'),
})

/** Content <-> Tag (many-to-many). */
export const contentTagLinks = sqliteTable('content_tag_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: integer('content_id').notNull().references(() => contents.id),
  tagId: integer('tag_id').notNull().references(() => contentTags.id),
}, (t) => ({
  uniquePair: uniqueIndex('uq_content_tag').on(t.contentId, t.tagId),
}))

/** Content <-> related Content (many-to-many, self-referencing). */
export const relatedContents = sqliteTable('related_contents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: integer('content_id').notNull().references(() => contents.id),
  relatedContentId: integer('related_content_id').notNull().references(() => contents.id),
}, (t) => ({
  uniquePair: uniqueIndex('uq_related_content').on(t.contentId, t.relatedContentId),
}))

/** Versioned snapshots of content body for editorial history / rollback. */
export const contentRevisions = sqliteTable('content_revisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: integer('content_id').notNull().references(() => contents.id),
  body: text('body').notNull(),
  editedBy: integer('edited_by').references(() => users.id),
  createdAt: text('created_at').notNull().default(nowIso),
})

/** Bibliographic sources cited by a content item. */
export const contentSources = sqliteTable('content_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contentId: integer('content_id').notNull().references(() => contents.id),
  title: text('title').notNull(),
  url: text('url'),
  createdAt: text('created_at').notNull().default(nowIso),
})
