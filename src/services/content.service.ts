/**
 * Service layer (portability rule 3.1): pure business logic for public
 * reference content listing/detail. Thin pass-through today, but this is
 * the seam where future rules (e.g. related-content ranking, view counting)
 * get added without touching routes or the repository's SQL.
 */
import type { ContentRepository, ContentListItem, ContentDetail, CategoryRecord } from '../repositories/content.repository'

export interface ContentService {
  listPublished(params: { categorySlug?: string; page?: number; pageSize?: number }): Promise<{ items: ContentListItem[]; total: number; page: number; pageSize: number }>
  getBySlug(slug: string): Promise<ContentDetail | null>
  listCategories(): Promise<CategoryRecord[]>
}

export function createContentService(repo: ContentRepository): ContentService {
  return {
    async listPublished(params) {
      const page = params.page && params.page > 0 ? params.page : 1
      const pageSize = params.pageSize && params.pageSize > 0 && params.pageSize <= 50 ? params.pageSize : 12
      const { items, total } = await repo.listPublished({ categorySlug: params.categorySlug, page, pageSize })
      return { items, total, page, pageSize }
    },

    async getBySlug(slug) {
      return repo.findPublishedBySlug(slug)
    },

    async listCategories() {
      return repo.listCategories()
    },
  }
}
