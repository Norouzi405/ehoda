/**
 * Hono middleware: the ONLY place a route ever asks "is this user allowed
 * to do X". Deny-by-default (spec §14.1) — if this middleware is missing
 * from a mutating route, that is a bug, not an oversight to rely on.
 */
import type { Context, Next } from 'hono'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createRoleRepository } from '../repositories/role.repository'
import { createAuthzService } from '../services/authz.service'

/** Set by the (not-yet-implemented) auth middleware after OTP session verification. */
export const CURRENT_USER_ID_KEY = 'currentUserId'

export function requirePermission(permissionKey: string) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const userId = c.get(CURRENT_USER_ID_KEY as never) as number | undefined
    if (!userId) {
      return c.json({ error: 'unauthenticated' }, 401)
    }

    const { db } = buildAppContext(c)
    const authz = createAuthzService(createRoleRepository(db))
    const allowed = await authz.hasPermission(userId, permissionKey)

    if (!allowed) {
      return c.json({ error: 'forbidden', required_permission: permissionKey }, 403)
    }
    await next()
  }
}
