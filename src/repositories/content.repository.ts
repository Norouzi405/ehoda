/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `contents`/`content_categories`/`content_tags`.
 */
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { contents, contentCategories, contentTags, contentTagLinks, ageGroups } from '../db/schema'

export interface ContentListItem {
  id: number
  slug: string
  title: string
  summary: string | null
  shortAnswer: string | null
  coverImageUrl: string | null
  categorySlug: string | null
  categoryNameFa: string | null
  publishedAt: string | null
}

export interface ContentDetail extends ContentListItem {
  body: string
  ageGroupLabelFa: string | null
  seoTitle: string | null
  seoDescription: string | null
  ogImageUrl: string | null
  ctaType: string | null
  ctaTargetSlug: string | null
}

export interface CategoryRecord {
  id: number
  slug: string
  nameFa: string
  description: string | null
  sortOrder: number
}

export interface ListContentsParams {
  categorySlug?: string
  page?: number
  pageSize?: number
}

export interface ContentRepository {
  listPublished(params: ListContentsParams): Promise<{ items: ContentListItem[]; total: number }>
  findPublishedBySlug(slug: string): Promise<ContentDetail | null>
  listCategories(): Promise<CategoryRecord[]>
}

export function createContentRepository(db: Database): ContentRepository {
  return {
    async listPublished({ categorySlug, page = 1, pageSize = 12 }: ListContentsParams) {
      const offset = (page - 1) * pageSize

      const whereClause = categorySlug
        ? and(eq(contents.status, 'published'), eq(contentCategories.slug, categorySlug))
        : eq(contents.status, 'published')

      const rows = await db
        .select({
          id: contents.id,
          slug: contents.slug,
          title: contents.title,
          summary: contents.summary,
          shortAnswer: contents.shortAnswer,
          coverImageUrl: contents.coverImageUrl,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          publishedAt: contents.publishedAt,
        })
        .from(contents)
        .leftJoin(contentCategories, eq(contentCategories.id, contents.categoryId))
        .where(whereClause)
        .orderBy(desc(contents.publishedAt))
        .limit(pageSize)
        .offset(offset)

      const countRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(contents)
        .leftJoin(contentCategories, eq(contentCategories.id, contents.categoryId))
        .where(whereClause)

      return { items: rows as ContentListItem[], total: Number(countRows[0]?.count ?? 0) }
    },

    async findPublishedBySlug(slug: string) {
      const rows = await db
        .select({
          id: contents.id,
          slug: contents.slug,
          title: contents.title,
          summary: contents.summary,
          shortAnswer: contents.shortAnswer,
          body: contents.body,
          coverImageUrl: contents.coverImageUrl,
          categorySlug: contentCategories.slug,
          categoryNameFa: contentCategories.nameFa,
          ageGroupLabelFa: ageGroups.labelFa,
          publishedAt: contents.publishedAt,
          seoTitle: contents.seoTitle,
          seoDescription: contents.seoDescription,
          ogImageUrl: contents.ogImageUrl,
          ctaType: contents.ctaType,
          ctaTargetSlug: contents.ctaTargetSlug,
        })
        .from(contents)
        .leftJoin(contentCategories, eq(contentCategories.id, contents.categoryId))
        .leftJoin(ageGroups, eq(ageGroups.id, contents.ageGroupId))
        .where(and(eq(contents.slug, slug), eq(contents.status, 'published')))
        .limit(1)

      return (rows[0] as ContentDetail | undefined) ?? null
    },

    async listCategories() {
      const rows = await db
        .select({
          id: contentCategories.id,
          slug: contentCategories.slug,
          nameFa: contentCategories.nameFa,
          description: contentCategories.description,
          sortOrder: contentCategories.sortOrder,
        })
        .from(contentCategories)
        .where(eq(contentCategories.isActive, true))
        .orderBy(contentCategories.sortOrder)

      return rows as CategoryRecord[]
    },
  }
}
