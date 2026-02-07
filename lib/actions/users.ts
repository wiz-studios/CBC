'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'
import type { SystemRoleName } from '@/lib/types'

type UserRow = Database['public']['Tables']['users']['Row']
type SchoolRow = Database['public']['Tables']['schools']['Row']
type RoleRow = Database['public']['Tables']['roles']['Row']
type UserRoleRow = Database['public']['Tables']['user_roles']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type UserWithAccess = UserRow & {
  roles: SystemRoleName[]
  role: SystemRoleName
  school: Pick<SchoolRow, 'id' | 'name' | 'code' | 'is_active'> | null
}

export type UsersResult =
  | { success: true; users: UserWithAccess[] }
  | { success: false; error: ActionError }

export type UserResult =
  | { success: true; user: UserRow }
  | { success: false; error: ActionError }

export type CreateUserResult =
  | { success: true; user: UserRow }
  | { success: false; error: ActionError }

export type SimpleResult =
  | { success: true }
  | { success: false; error: ActionError }

function toActionError(error: any): ActionError {
  const message = String(error?.message || error || 'Unknown error').trim() || 'Unknown error'
  const code = String(error?.code || 'unknown_error').trim() || 'unknown_error'
  return { code, message }
}

async function requireSignedIn(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: { code: 'not_authenticated', message: 'Please sign in.' } }
  return { ok: true, user }
}

function pickPrimaryRole(roles: SystemRoleName[]): SystemRoleName {
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
  if (roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN'
  if (roles.includes('HEAD_TEACHER')) return 'HEAD_TEACHER'
  return 'TEACHER'
}

async function getSystemRoleId(roleName: SystemRoleName) {
  const { data: role, error } = await admin
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .eq('is_system_role', true)
    .maybeSingle()

  if (error) throw error
  if (!role) throw new Error('RBAC roles not seeded. Run scripts/002_rbac_seed.sql.')
  return role.id as string
}

async function assignSystemRole(userId: string, schoolId: string, roleName: SystemRoleName) {
  const roleId = await getSystemRoleId(roleName)
  const { error } = await admin.from('user_roles').upsert(
    {
      user_id: userId,
      role_id: roleId,
      school_id: schoolId,
    },
    { onConflict: 'user_id,role_id,school_id' }
  )
  if (error) throw error
}

async function ensureTeacherRow(userId: string, schoolId: string) {
  const { error } = await admin.from('teachers').upsert(
    {
      user_id: userId,
      school_id: schoolId,
    },
    { onConflict: 'user_id,school_id' }
  )
  if (error) throw error
}

export async function getUsers(params?: {
  query?: string
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'all'
}): Promise<UsersResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const scope = auth.user.role
    if (scope !== 'SUPER_ADMIN' && scope !== 'SCHOOL_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Admin access required.' } }
    }

    const query = params?.query?.trim()
    const status = params?.status ?? 'all'

    let q = admin.from('users').select('*').order('created_at', { ascending: false })
    if (scope === 'SCHOOL_ADMIN') {
      q = q.eq('school_id', auth.user.school_id)
    }
    if (status !== 'all') {
      q = q.eq('status', status)
    }
    if (query) {
      const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_')
      q = q.or(`email.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
    }

    const { data: users, error: usersError } = await q
    if (usersError) throw usersError

    const userRows = (users ?? []) as UserRow[]
    if (userRows.length === 0) return { success: true, users: [] }

    const userIds = userRows.map((u) => u.id)

    const { data: userRoles, error: userRolesError } = await admin
      .from('user_roles')
      .select('user_id, role_id')
      .in('user_id', userIds)

    if (userRolesError) throw userRolesError

    const roleIds = Array.from(new Set(((userRoles ?? []) as any[]).map((ur) => ur.role_id).filter(Boolean)))

    const { data: roles, error: rolesError } =
      roleIds.length > 0
        ? await admin.from('roles').select('id, name, is_system_role').in('id', roleIds)
        : { data: [], error: null as any }

    if (rolesError) throw rolesError

    const roleNameById = new Map<string, SystemRoleName>()
    ;((roles ?? []) as any[]).forEach((r: RoleRow) => {
      if (r?.name) roleNameById.set(r.id, r.name as SystemRoleName)
    })

    const rolesByUserId = new Map<string, SystemRoleName[]>()
    ;((userRoles ?? []) as any[]).forEach((ur: Pick<UserRoleRow, 'user_id' | 'role_id'>) => {
      const roleName = roleNameById.get(ur.role_id)
      if (!roleName) return
      const list = rolesByUserId.get(ur.user_id) ?? []
      list.push(roleName)
      rolesByUserId.set(ur.user_id, list)
    })

    const schoolIds = Array.from(new Set(userRows.map((u) => u.school_id).filter(Boolean)))
    const { data: schools, error: schoolsError } =
      schoolIds.length > 0
        ? await admin.from('schools').select('id, name, code, is_active').in('id', schoolIds)
        : { data: [], error: null as any }

    if (schoolsError) throw schoolsError

    const schoolById = new Map<string, Pick<SchoolRow, 'id' | 'name' | 'code' | 'is_active'>>()
    ;((schools ?? []) as any[]).forEach((s: any) => {
      schoolById.set(s.id, s)
    })

    const enriched: UserWithAccess[] = userRows.map((u) => {
      const roles = rolesByUserId.get(u.id) ?? []
      return {
        ...u,
        roles,
        role: pickPrimaryRole(roles),
        school: schoolById.get(u.school_id) ?? null,
      }
    })

    return { success: true, users: enriched }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function createUser(input: {
  first_name: string
  last_name: string
  email: string
  password: string
  role: SystemRoleName
  school_id?: string
}): Promise<CreateUserResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'SUPER_ADMIN' && auth.user.role !== 'SCHOOL_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Admin access required.' } }
    }

    if (auth.user.role === 'SUPER_ADMIN' && input.role !== 'SCHOOL_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Super admin can only create SCHOOL_ADMIN users.' } }
    }

    if (input.role === 'SUPER_ADMIN' && auth.user.role !== 'SUPER_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Cannot create platform admins.' } }
    }

    const first_name = input.first_name.trim()
    const last_name = input.last_name.trim()
    const email = input.email.trim().toLowerCase()
    const password = input.password

    if (!first_name || !last_name || !email || !password) {
      return { success: false, error: { code: 'invalid_input', message: 'All fields are required.' } }
    }

    if (password.length < 8) {
      return { success: false, error: { code: 'weak_password', message: 'Password must be at least 8 characters.' } }
    }

    const schoolId =
      auth.user.role === 'SCHOOL_ADMIN'
        ? auth.user.school_id
        : input.school_id || ''

    if (!schoolId) {
      return { success: false, error: { code: 'invalid_input', message: 'School is required.' } }
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    })

    if (authError) throw authError
    if (!authData?.user?.id) throw new Error('Failed to create auth user.')

    const { data: userData, error: userError } = await admin
      .from('users')
      .insert({
        id: authData.user.id,
        school_id: schoolId,
        email,
        first_name,
        last_name,
        status: 'ACTIVE',
        auth_id: authData.user.id,
      })
      .select('*')
      .single()

    if (userError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      throw userError
    }

    await ensureTeacherRow(authData.user.id, schoolId)
    await assignSystemRole(authData.user.id, schoolId, input.role)

    await admin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: auth.user.id,
      action: 'users:create',
      resource_type: 'users',
      resource_id: authData.user.id,
      changes: { email, role: input.role },
    })

    return { success: true, user: userData as UserRow }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function setUserStatus(userId: string, status: UserRow['status']): Promise<UserResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'SUPER_ADMIN' && auth.user.role !== 'SCHOOL_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Admin access required.' } }
    }

    const { data: target, error: targetError } = await admin
      .from('users')
      .select('id, school_id')
      .eq('id', userId)
      .single()

    if (targetError) throw targetError

    if (auth.user.role === 'SCHOOL_ADMIN' && target.school_id !== auth.user.school_id) {
      return { success: false, error: { code: 'forbidden', message: 'Cannot manage users from another school.' } }
    }

    if (auth.user.role === 'SCHOOL_ADMIN') {
      const { data: ur, error: urError } = await admin
        .from('user_roles')
        .select('role_id')
        .eq('user_id', userId)

      if (urError) throw urError

      const roleIds = Array.from(new Set(((ur ?? []) as any[]).map((r) => r.role_id).filter(Boolean)))
      if (roleIds.length) {
        const { data: roles, error: rolesError } = await admin.from('roles').select('id, name').in('id', roleIds)
        if (rolesError) throw rolesError
        const hasSuper = ((roles ?? []) as any[]).some((r) => r.name === 'SUPER_ADMIN')
        if (hasSuper) {
          return { success: false, error: { code: 'forbidden', message: 'Cannot modify platform admins.' } }
        }
      }
    }

    const { data: updated, error } = await admin
      .from('users')
      .update({ status })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: target.school_id,
      user_id: auth.user.id,
      action: 'users:update_status',
      resource_type: 'users',
      resource_id: userId,
      changes: { status },
    })

    return { success: true, user: updated as UserRow }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function setUserSuperAdmin(userId: string, makeSuperAdmin: boolean): Promise<SimpleResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'SUPER_ADMIN') {
      return { success: false, error: { code: 'forbidden', message: 'Super admin access required.' } }
    }

    if (!makeSuperAdmin && userId === auth.user.id) {
      return { success: false, error: { code: 'forbidden', message: 'You cannot revoke your own SUPER_ADMIN role.' } }
    }

    const { data: role, error: roleError } = await admin
      .from('roles')
      .select('id')
      .eq('name', 'SUPER_ADMIN')
      .eq('is_system_role', true)
      .maybeSingle()

    if (roleError) throw roleError
    if (!role?.id) return { success: false, error: { code: 'missing_role', message: 'SUPER_ADMIN role missing.' } }

    const roleId = role.id as string

    const { data: target, error: targetError } = await admin
      .from('users')
      .select('id, school_id')
      .eq('id', userId)
      .single()

    if (targetError) throw targetError

    if (makeSuperAdmin) {
      const { error } = await admin
        .from('user_roles')
        .upsert(
          { user_id: userId, role_id: roleId, school_id: target.school_id },
          { onConflict: 'user_id,role_id,school_id' }
        )

      if (error) throw error

      await admin.from('audit_logs').insert({
        school_id: target.school_id,
        user_id: auth.user.id,
        action: 'super_admin:grant',
        resource_type: 'user_roles',
        resource_id: null,
        changes: { user_id: userId, role: 'SUPER_ADMIN' },
      })

      return { success: true }
    }

    const { count: superCount, error: countError } = await admin
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId)

    if (countError) throw countError

    if ((superCount ?? 0) <= 1) {
      return { success: false, error: { code: 'lockout_prevented', message: 'Cannot revoke the last super admin.' } }
    }

    const { error } = await admin.from('user_roles').delete().eq('user_id', userId).eq('role_id', roleId)
    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: target.school_id,
      user_id: auth.user.id,
      action: 'super_admin:revoke',
      resource_type: 'user_roles',
      resource_id: null,
      changes: { user_id: userId, role: 'SUPER_ADMIN' },
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}
