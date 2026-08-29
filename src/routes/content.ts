/**
 * Public content API (spec §7.2, §7.3, docs/api.md). Thin HTTP layer only.
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createContentRepository } from '../repositories/content.repository'
import { createContentService } from '../services/content.service'

export const contentRoute = new Hono<{ Bindings: Bindings }>()

contentRoute.get('/contents', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))

  const categorySlug = c.req.query('category') || undefined
  const page = c.req.query('page') ? Number(c.req.query('page')) : undefined
  const result = await service.listPublished({ categorySlug, page })

  return c.json(result)
})

contentRoute.get('/contents/:slug', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))

  const content = await service.getBySlug(c.req.param('slug'))
  if (!content) return c.json({ error: 'not_found' }, 404)

  return c.json(content)
})

contentRoute.get('/categories', async (c) => {
  const ctx = buildAppContext(c)
  const service = createContentService(createContentRepository(ctx.db))
  return c.json({ items: await service.listCategories() })
})
