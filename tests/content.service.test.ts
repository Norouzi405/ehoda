import { describe, it, expect } from 'vitest'
import { createContentService } from '../src/services/content.service'
import type { ContentRepository, ContentListItem, ContentDetail, CategoryRecord } from '../src/repositories/content.repository'

function item(overrides: Partial<ContentListItem>): ContentListItem {
  return {
    id: overrides.id ?? 1,
    slug: overrides.slug ?? 'sample',
    title: overrides.title ?? 'نمونه',
    summary: overrides.summary ?? null,
    shortAnswer: overrides.shortAnswer ?? null,
    coverImageUrl: overrides.coverImageUrl ?? null,
    categorySlug: overrides.categorySlug ?? null,
    categoryNameFa: overrides.categoryNameFa ?? null,
    publishedAt: overrides.publishedAt ?? '2026-01-01T00:00:00.000Z',
  }
}

function createFakeContentRepo(items: ContentListItem[], detail?: ContentDetail, categories: CategoryRecord[] = []): ContentRepository {
  return {
    async listPublished({ categorySlug, page = 1, pageSize = 12 }) {
      const filtered = categorySlug ? items.filter((i) => i.categorySlug === categorySlug) : items
      const offset = (page - 1) * pageSize
      return { items: filtered.slice(offset, offset + pageSize), total: filtered.length }
    },
    async findPublishedBySlug(slug) {
      return detail && detail.slug === slug ? detail : null
    },
    async listCategories() {
      return categories
    },
  }
}

describe('ContentService.listPublished', () => {
  it('defaults to page 1 / pageSize 12', async () => {
    const repo = createFakeContentRepo([item({ id: 1 })])
    const service = createContentService(repo)
    const result = await service.listPublished({})
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(12)
    expect(result.items.length).toBe(1)
  })

  it('clamps an out-of-range pageSize back to the default', async () => {
    const repo = createFakeContentRepo([item({ id: 1 })])
    const service = createContentService(repo)
    const result = await service.listPublished({ pageSize: 999 })
    expect(result.pageSize).toBe(12)
  })

  it('filters by category slug', async () => {
    const repo = createFakeContentRepo([
      item({ id: 1, categorySlug: 'child-and-media' }),
      item({ id: 2, categorySlug: 'media-literacy' }),
    ])
    const service = createContentService(repo)
    const result = await service.listPublished({ categorySlug: 'media-literacy' })
    expect(result.items.map((i) => i.id)).toEqual([2])
  })
})

describe('ContentService.getBySlug', () => {
  it('returns null for a non-existent or unpublished slug', async () => {
    const repo = createFakeContentRepo([])
    const service = createContentService(repo)
    expect(await service.getBySlug('missing')).toBeNull()
  })
})
