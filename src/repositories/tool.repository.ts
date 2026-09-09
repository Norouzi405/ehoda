/**
 * Repository layer (portability rule 3.1): the ONLY place allowed to write
 * Drizzle queries against `tools` / `tool_submissions` / `pdf_exports`
 * (spec §11 — Interactive Toolkit House: family media agreement, phone
 * readiness checklist, media style quiz).
 *
 * Ownership rule: `tool_submissions.user_id` is nullable (anonymous
 * preview is allowed, spec §11) but any row that DOES have a `userId` is
 * private to that user (mandatory requirement — "private, user-linked").
 * Callers MUST check `submission.userId === requesterId` (or an admin
 * override) before ever returning a submission's contents or PDF to an
 * HTTP caller — this repository does not enforce that itself, the same
 * way `question.repository.ts` separates raw/private DTOs from the
 * ownership check, which lives in the Service/Route layer.
 */
import { eq, desc } from 'drizzle-orm'
import type { Database } from '../db/client'
import { tools, toolSubmissions, pdfExports } from '../db/schema'

export interface ToolRecord {
  id: number
  slug: string
  titleFa: string
  description: string | null
  pdfTemplateKey: string
  isActive: boolean
}

export interface ToolSubmissionRecord {
  id: number
  toolId: number
  userId: number | null
  answersJson: string
  resultJson: string | null
  createdAt: string
}

export interface CreateSubmissionInput {
  toolId: number
  userId: number | null
  answersJson: string
  resultJson: string | null
}

export interface PdfExportRecord {
  id: number
  toolSubmissionId: number
  storageKey: string
  status: string
  expiresAt: string
  createdAt: string
}

export interface CreatePdfExportInput {
  toolSubmissionId: number
  storageKey: string
  status: string
  expiresAt: string
}

export interface ToolRepository {
  findBySlug(slug: string): Promise<ToolRecord | null>
  findById(id: number): Promise<ToolRecord | null>
  listActive(): Promise<ToolRecord[]>
  createSubmission(input: CreateSubmissionInput): Promise<ToolSubmissionRecord>
  findSubmissionById(id: number): Promise<ToolSubmissionRecord | null>
  createPdfExport(input: CreatePdfExportInput): Promise<PdfExportRecord>
  findLatestPdfExportForSubmission(submissionId: number): Promise<PdfExportRecord | null>
  updatePdfExportStatus(id: number, status: string): Promise<void>
}

function toToolRecord(row: typeof tools.$inferSelect): ToolRecord {
  return {
    id: row.id,
    slug: row.slug,
    titleFa: row.titleFa,
    description: row.description,
    pdfTemplateKey: row.pdfTemplateKey,
    isActive: Boolean(row.isActive),
  }
}

export function createToolRepository(db: Database): ToolRepository {
  return {
    async findBySlug(slug: string) {
      const rows = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1)
      return rows[0] ? toToolRecord(rows[0]) : null
    },

    async findById(id: number) {
      const rows = await db.select().from(tools).where(eq(tools.id, id)).limit(1)
      return rows[0] ? toToolRecord(rows[0]) : null
    },

    async listActive() {
      const rows = await db.select().from(tools).where(eq(tools.isActive, true))
      return rows.map(toToolRecord)
    },

    async createSubmission(input: CreateSubmissionInput) {
      const inserted = await db
        .insert(toolSubmissions)
        .values({
          toolId: input.toolId,
          userId: input.userId,
          answersJson: input.answersJson,
          resultJson: input.resultJson,
        })
        .returning()
      return inserted[0] as ToolSubmissionRecord
    },

    async findSubmissionById(id: number) {
      const rows = await db.select().from(toolSubmissions).where(eq(toolSubmissions.id, id)).limit(1)
      return (rows[0] as ToolSubmissionRecord | undefined) ?? null
    },

    async createPdfExport(input: CreatePdfExportInput) {
      const inserted = await db
        .insert(pdfExports)
        .values({
          toolSubmissionId: input.toolSubmissionId,
          storageKey: input.storageKey,
          status: input.status,
          expiresAt: input.expiresAt,
        })
        .returning()
      return inserted[0] as PdfExportRecord
    },

    async findLatestPdfExportForSubmission(submissionId: number) {
      const rows = await db
        .select()
        .from(pdfExports)
        .where(eq(pdfExports.toolSubmissionId, submissionId))
        .orderBy(desc(pdfExports.id))
        .limit(1)
      return (rows[0] as PdfExportRecord | undefined) ?? null
    },

    async updatePdfExportStatus(id: number, status: string) {
      await db.update(pdfExports).set({ status }).where(eq(pdfExports.id, id))
    },
  }
}
