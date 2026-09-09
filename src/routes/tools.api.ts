/**
 * Interactive Toolkit House — JSON API (spec §11, docs/api.md "Tools").
 * The human-facing SSR counterpart lives in src/routes/tools.pages.tsx and
 * calls this SAME Service layer (D-004: no duplicated business logic).
 *
 * Mounted under `/api` in src/index.tsx.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createToolRepository } from '../repositories/tool.repository'
import { createToolService } from '../services/tool.service'
import { renderToolPdfHtml } from '../services/tool-pdf.service'
import { createRoleRepository } from '../repositories/role.repository'
import { createAuthzService } from '../services/authz.service'
import { CURRENT_USER_ID_KEY } from '../middleware/rbac'

export const toolsRoute = new Hono<{ Bindings: Bindings }>()

function service(ctx: ReturnType<typeof buildAppContext>) {
  return createToolService(createToolRepository(ctx.db))
}

/** How long a freshly generated PDF's signed download link stays valid. */
const PDF_LINK_TTL_SECONDS = 60 * 30 // 30 minutes

// ------------------------- Submit (per-tool schemas) -------------------------

const familyAgreementSchema = z.object({
  familyMembers: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.enum(['parent', 'child']),
        ageGroupSlug: z.string().optional(),
      }),
    )
    .min(1),
  devices: z.array(z.string()).default([]),
  sensitiveSituations: z.array(z.string()).default([]),
  parentCommitments: z.array(z.string()).default([]),
  childCommitments: z.array(z.string()).default([]),
  reviewDate: z.string().min(1),
})

const likertAnswersSchema = z.record(z.string(), z.number().min(1).max(5))

toolsRoute.post('/tools/:slug/submit', async (c) => {
  const slug = c.req.param('slug')
  const userId = (c.get(CURRENT_USER_ID_KEY as never) as number | undefined) ?? null
  const ctx = buildAppContext(c)
  const toolService = service(ctx)

  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ error: 'invalid_input' }, 400)

  try {
    if (slug === 'family_media_contract') {
      const parsed = familyAgreementSchema.safeParse(body)
      if (!parsed.success) return c.json({ error: 'validation_error', message: parsed.error.message }, 400)
      const { submissionId, result } = await toolService.submitFamilyAgreement(parsed.data, userId)
      return c.json({ submissionId, result })
    }

    if (slug === 'phone_readiness_checklist') {
      const parsed = likertAnswersSchema.safeParse(body.answers)
      if (!parsed.success) return c.json({ error: 'validation_error', message: parsed.error.message }, 400)
      const { submissionId, result } = await toolService.submitPhoneReadiness(parsed.data, userId)
      return c.json({ submissionId, result })
    }

    if (slug === 'media_style_quiz') {
      const parsed = likertAnswersSchema.safeParse(body.answers)
      if (!parsed.success) return c.json({ error: 'validation_error', message: parsed.error.message }, 400)
      const { submissionId, result } = await toolService.submitMediaStyleQuiz(parsed.data, userId)
      return c.json({ submissionId, result })
    }

    return c.json({ error: 'unknown_tool' }, 404)
  } catch (err) {
    return c.json({ error: 'submit_failed', message: err instanceof Error ? err.message : 'unknown_error' }, 500)
  }
})

// ------------------------- PDF download (signed, ownership-checked) -------------------------
//
// GET /api/tools/submissions/:id/pdf (docs/api.md "Tools"):
// Renders (or reuses a fresh cached) PDF for an owned submission, stores
// it in R2 via StorageService, and returns a signed time-limited URL
// (StorageService.getSignedUrl -> GET /files/:key, see src/routes/files.ts).
// 403 if the requester is not the owner or an authorized admin
// (tools.manage permission).

toolsRoute.get('/tools/submissions/:id/pdf', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid_input' }, 400)

  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const toolService = service(ctx)
  const toolRepo = createToolRepository(ctx.db)

  const authzService = createAuthzService(createRoleRepository(ctx.db))
  const isAdminOverride = await authzService.hasPermission(userId, 'tools.manage')

  const submission = await toolService.getOwnedSubmission(id, userId, isAdminOverride)
  if (!submission) return c.json({ error: 'forbidden' }, 403)
  if (!submission.resultJson) return c.json({ error: 'no_result_available' }, 404)

  const tool = await toolService.getToolById(submission.toolId)
  if (!tool) return c.json({ error: 'unknown_tool' }, 404)

  try {
    // Re-use a still-valid, already-rendered PDF if one exists, otherwise
    // render + upload a fresh one (never render on every download).
    const existing = await toolRepo.findLatestPdfExportForSubmission(submission.id)
    const now = Date.now()
    let storageKey = existing && existing.status === 'ready' && new Date(existing.expiresAt).getTime() > now ? existing.storageKey : null

    if (!storageKey) {
      const html = renderToolPdfHtml(tool.slug, JSON.parse(submission.resultJson))
      const pdfBytes = await ctx.pdf.renderHtmlToPdf(html)
      const key = `tool-pdfs/${tool.slug}/${submission.id}-${now}.pdf`
      await ctx.storage.put(key, pdfBytes, 'application/pdf')
      const expiresAt = new Date(now + PDF_LINK_TTL_SECONDS * 1000).toISOString()
      await toolRepo.createPdfExport({ toolSubmissionId: submission.id, storageKey: key, status: 'ready', expiresAt })
      storageKey = key
    }

    const signedUrl = await ctx.storage.getSignedUrl(storageKey, PDF_LINK_TTL_SECONDS)
    if (!signedUrl) return c.json({ error: 'pdf_not_found' }, 404)
    return c.json({ downloadUrl: signedUrl, expiresInSeconds: PDF_LINK_TTL_SECONDS })
  } catch (err) {
    return c.json(
      {
        error: 'pdf_generation_failed',
        message: err instanceof Error ? err.message : 'unknown_error',
        hint: 'Ensure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Browser Rendering: Edit) secrets are configured.',
      },
      502,
    )
  }
})

// ------------------------- Text preview (in-browser, before PDF) -------------------------
// Mandatory requirement: "in-browser text preview before download". This
// returns the same structured result the wizard already has client-side
// after submit — exposed here too so a submissionId-only reload (e.g. the
// user revisits a saved link) can re-render the preview without needing
// the PDF adapter/secrets at all.

toolsRoute.get('/tools/submissions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid_input' }, 400)

  const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
  if (!userId) return c.json({ error: 'unauthenticated' }, 401)

  const ctx = buildAppContext(c)
  const toolService = service(ctx)
  const authzService = createAuthzService(createRoleRepository(ctx.db))
  const isAdminOverride = await authzService.hasPermission(userId, 'tools.manage')

  const submission = await toolService.getOwnedSubmission(id, userId, isAdminOverride)
  if (!submission) return c.json({ error: 'forbidden' }, 403)

  return c.json({
    submissionId: submission.id,
    toolId: submission.toolId,
    result: submission.resultJson ? JSON.parse(submission.resultJson) : null,
    createdAt: submission.createdAt,
  })
})
