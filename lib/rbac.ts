'use server'

import { supabase } from './supabase'
import type { User } from './supabase'

export type Permission = {
  id: string
  name: string
  description?: string
  resource: string
  action: string
}

export type Role = {
  id: string
  school_id?: string
  name: string
  description?: string
  is_system_role: boolean
}

// Get user's permissions
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  try {
    // Get user's roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)

    if (rolesError) throw rolesError

    if (!userRoles || userRoles.length === 0) return []

    const roleIds = userRoles.map((ur) => ur.role_id)

    // Get permissions for these roles
    const { data: permissions, error: permError } = await supabase
      .from('role_permissions')
      .select('permissions(*)')
      .in('role_id', roleIds)

    if (permError) throw permError

    // Extract and deduplicate permissions
    const uniquePermissions = Array.from(
      new Map(
        permissions
          .flatMap((rp) => (Array.isArray(rp.permissions) ? rp.permissions : [rp.permissions]))
          .map((p) => [p.id, p])
      ).values()
    )

    return uniquePermissions
  } catch (error) {
    console.error('Get user permissions error:', error)
    return []
  }
}

// Check if user has a specific permission
export async function hasPermission(
  userId: string,
  permissionName: string
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId)
    return permissions.some((p) => p.name === permissionName)
  } catch (error) {
    console.error('Has permission error:', error)
    return false
  }
}

// Check if user has any of the specified permissions
export async function hasAnyPermission(
  userId: string,
  permissionNames: string[]
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId)
    return permissionNames.some((pName) => permissions.some((p) => p.name === pName))
  } catch (error) {
    console.error('Has any permission error:', error)
    return false
  }
}

// Check if user has all specified permissions
export async function hasAllPermissions(
  userId: string,
  permissionNames: string[]
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId)
    return permissionNames.every((pName) => permissions.some((p) => p.name === pName))
  } catch (error) {
    console.error('Has all permissions error:', error)
    return false
  }
}

// Assign role to user
export async function assignRoleToUser(userId: string, roleId: string) {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_id: roleId,
      })
      .select()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Assign role error:', error)
    throw error
  }
}

// Remove role from user
export async function removeRoleFromUser(userId: string, roleId: string) {
  try {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)

    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Remove role error:', error)
    throw error
  }
}

// Get user's roles
export async function getUserRoles(userId: string): Promise<Role[]> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles(*)')
      .eq('user_id', userId)

    if (error) throw error

    const roles = (data ?? [])
      .map((ur: any) => (Array.isArray(ur.roles) ? ur.roles[0] : ur.roles))
      .filter(Boolean) as Role[]

    return roles
  } catch (error) {
    console.error('Get user roles error:', error)
    return []
  }
}

// Check if user is admin
export async function isAdmin(user: User): Promise<boolean> {
  return user.role === 'ADMIN' || (await hasPermission(user.id, 'users.delete'))
}

// Check if user is teacher
export async function isTeacher(user: User): Promise<boolean> {
  return user.role === 'TEACHER' || (await hasPermission(user.id, 'attendance.create'))
}

// Check if user can manage marks
export async function canManageMarks(userId: string): Promise<boolean> {
  return await hasPermission(userId, 'marks.create')
}

// Check if user can view reports
export async function canViewReports(userId: string): Promise<boolean> {
  return await hasPermission(userId, 'reports.read')
}
