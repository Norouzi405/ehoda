/**
 * Service layer sample (portability rule 3.1): pure business logic, zero
 * framework/Cloudflare imports. Depends only on the RoleRepository
 * interface, injected by the caller (see src/middleware/rbac.ts).
 */
import type { RoleRepository } from '../repositories/role.repository'

export interface AuthzService {
  hasPermission(userId: number, permissionKey: string): Promise<boolean>
  getRoleKeys(userId: number): Promise<string[]>
}

export function createAuthzService(roleRepo: RoleRepository): AuthzService {
  return {
    async hasPermission(userId: number, permissionKey: string): Promise<boolean> {
      // super_admin implicitly has every permission (deny-by-default
      // elsewhere; this is the single explicit bypass, spec §5.2.G).
      const roleKeys = await roleRepo.getRoleKeysForUser(userId)
      if (roleKeys.includes('super_admin')) return true

      const permissionKeys = await roleRepo.getPermissionKeysForUser(userId)
      return permissionKeys.includes(permissionKey)
    },

    async getRoleKeys(userId: number): Promise<string[]> {
      return roleRepo.getRoleKeysForUser(userId)
    },
  }
}
