/**
 * Repository layer sample (portability rule 3.1): the ONLY place allowed
 * to write Drizzle queries for roles/permissions. Returns plain DTOs, not
 * Drizzle's internal types, so callers stay decoupled from the ORM.
 */
import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/client'
import { modelHasRoles, roles, rolePermissions, permissions, modelHasPermissions } from '../db/schema'

export interface RoleRepository {
  getRoleKeysForUser(userId: number): Promise<string[]>
  getPermissionKeysForUser(userId: number): Promise<string[]>
}

export function createRoleRepository(db: Database): RoleRepository {
  return {
    async getRoleKeysForUser(userId: number): Promise<string[]> {
      const rows = await db
        .select({ key: roles.key })
        .from(modelHasRoles)
        .innerJoin(roles, eq(roles.id, modelHasRoles.roleId))
        .where(eq(modelHasRoles.userId, userId))
      return rows.map((r) => r.key)
    },

    async getPermissionKeysForUser(userId: number): Promise<string[]> {
      const roleIds = await db
        .select({ roleId: modelHasRoles.roleId })
        .from(modelHasRoles)
        .where(eq(modelHasRoles.userId, userId))

      const roleIdList = roleIds.map((r) => r.roleId)

      const fromRoles = roleIdList.length
        ? await db
            .select({ key: permissions.key })
            .from(rolePermissions)
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(inArray(rolePermissions.roleId, roleIdList))
        : []

      const direct = await db
        .select({ key: permissions.key })
        .from(modelHasPermissions)
        .innerJoin(permissions, eq(permissions.id, modelHasPermissions.permissionId))
        .where(eq(modelHasPermissions.userId, userId))

      return Array.from(new Set([...fromRoles, ...direct].map((r) => r.key)))
    },
  }
}
