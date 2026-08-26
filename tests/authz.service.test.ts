import { describe, it, expect } from 'vitest'
import { createAuthzService } from '../src/services/authz.service'
import type { RoleRepository } from '../src/repositories/role.repository'

/**
 * Unit test for the RBAC core (spec §16.1: "نقش غیرمجاز نتواند مجوز حساس
 * را تغییر دهد" and general deny-by-default enforcement). Uses a fake
 * RoleRepository — this is exactly the point of the layered architecture:
 * AuthzService is testable without a real database or Cloudflare runtime.
 */

describe('AuthzService.hasPermission', () => {
  it('grants access when the permission is directly assigned via role', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['moderator'],
      getPermissionKeysForUser: async () => ['question.moderate', 'response.moderate'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'question.moderate')).resolves.toBe(true)
  })

  it('denies access by default when the permission is absent (deny-by-default)', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['member'],
      getPermissionKeysForUser: async () => ['response.create', 'response.reply'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'settings.manage')).resolves.toBe(false)
  })

  it('super_admin bypasses all explicit permission checks', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['super_admin'],
      getPermissionKeysForUser: async () => [],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'settings.manage')).resolves.toBe(true)
  })

  it('a member role can never obtain a moderation permission it was not granted', async () => {
    const repo: RoleRepository = {
      getRoleKeysForUser: async () => ['member', 'expert'],
      getPermissionKeysForUser: async () => ['response.create', 'response.reply'],
    }
    const authz = createAuthzService(repo)
    await expect(authz.hasPermission(1, 'response.moderate')).resolves.toBe(false)
    await expect(authz.hasPermission(1, 'professional.approve')).resolves.toBe(false)
  })
})
