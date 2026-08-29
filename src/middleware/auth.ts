/**
 * Session-resolution middleware. Reads the `session` HttpOnly cookie (if
 * present), resolves it to a user id via AuthService, and stores it on the
 * Hono context under CURRENT_USER_ID_KEY (see src/middleware/rbac.ts, which
 * consumes it). Always calls next() — this middleware never blocks a
 * request; it only annotates it. Route-level access control is the job of
 * requirePermission() / an explicit `if (!userId) return 401` check.
 */
import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Bindings } from '../lib/bindings'
import { buildAppContext } from '../lib/context'
import { createUserRepository } from '../repositories/user.repository'
import { createSessionRepository } from '../repositories/session.repository'
import { createAuthService } from '../services/auth.service'
import { CURRENT_USER_ID_KEY } from './rbac'

export const SESSION_COOKIE_NAME = 'session'

export async function attachCurrentUser(c: Context<{ Bindings: Bindings }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (token) {
    const { db } = buildAppContext(c)
    const auth = createAuthService(createUserRepository(db), createSessionRepository(db))
    const resolved = await auth.resolveSession(token)
    if (resolved) {
      c.set(CURRENT_USER_ID_KEY as never, resolved.userId as never)
    }
  }
  await next()
}
