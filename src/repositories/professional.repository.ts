/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `professional_profiles` / `professional_expertise_areas`
 * / `expertise_areas`.
 */
import { eq, and } from 'drizzle-orm'
import type { Database } from '../db/client'
import { professionalProfiles, professionalExpertiseAreas, expertiseAreas, contentCategories } from '../db/schema'

export interface ProfessionalProfileRecord {
  id: number
  userId: number
  credentialType: string // professor | expert
  status: string
  professionalTitle: string | null
  fastPublishEnabled: boolean
}

export interface ProfessionalRepository {
  findActiveByUserId(userId: number): Promise<ProfessionalProfileRecord | null>
  /** Content-category slugs matching this professional's declared expertise areas (by matching slug, spec §10.1/§2.4). */
  listExpertiseCategoryIds(professionalProfileId: number): Promise<number[]>
}

export function createProfessionalRepository(db: Database): ProfessionalRepository {
  return {
    async findActiveByUserId(userId) {
      const rows = await db
        .select({
          id: professionalProfiles.id,
          userId: professionalProfiles.userId,
          credentialType: professionalProfiles.credentialType,
          status: professionalProfiles.status,
          professionalTitle: professionalProfiles.professionalTitle,
          fastPublishEnabled: professionalProfiles.fastPublishEnabled,
        })
        .from(professionalProfiles)
        .where(and(eq(professionalProfiles.userId, userId), eq(professionalProfiles.status, 'active')))
        .limit(1)
      const row = rows[0]
      if (!row) return null
      return { ...row, fastPublishEnabled: Boolean(row.fastPublishEnabled) }
    },

    async listExpertiseCategoryIds(professionalProfileId) {
      // expertise_areas and content_categories are separate taxonomies
      // (see docs/decisions.md D-013); we match them by slug since Phase 2
      // seeds both taxonomies with the same topic slugs for professionals.
      const areaRows = await db
        .select({ slug: expertiseAreas.slug })
        .from(professionalExpertiseAreas)
        .innerJoin(expertiseAreas, eq(expertiseAreas.id, professionalExpertiseAreas.expertiseAreaId))
        .where(eq(professionalExpertiseAreas.professionalProfileId, professionalProfileId))

      if (areaRows.length === 0) return []

      const slugs = areaRows.map((r) => r.slug)
      const categoryRows = await db.select({ id: contentCategories.id, slug: contentCategories.slug }).from(contentCategories)
      return categoryRows.filter((c) => slugs.includes(c.slug)).map((c) => c.id)
    },
  }
}
