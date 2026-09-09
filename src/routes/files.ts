/**
 * GET /files/:key — validates the `exp`/`sig` query params produced by
 * StorageService.getSignedUrl (see r2.storage-service.ts) and serves the
 * R2 object. This is the missing piece referenced by that adapter's own
 * doc-comment (portability rule 3.6: only this route + the adapter know
 * about the signing scheme; callers just get an opaque URL).
 */
import { Hono } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'

export const filesRoute = new Hono<{ Bindings: Bindings }>()

filesRoute.get('/files/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  const exp = Number(c.req.query('exp'))
  const sig = c.req.query('sig') || ''

  if (!key || !Number.isFinite(exp) || !sig) {
    return c.json({ error: 'invalid_link' }, 400)
  }

  const ctx = buildAppContext(c)
  const valid = await ctx.storage.verifySignedAccess(key, exp, sig)
  if (!valid) {
    return c.json({ error: 'link_expired_or_invalid' }, 403)
  }

  const data = await ctx.storage.get(key)
  if (!data) {
    return c.json({ error: 'not_found' }, 404)
  }

  const contentType = key.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  })
})
