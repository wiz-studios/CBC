'use server'

import { redirect } from 'next/navigation'

import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { CurrentUser, SystemRoleName, UserRow } from '@/lib/types'

type ActionError = {
  code: string
  message: string
}

export type SignUpResult =
  | { success: true; user: UserRow; role: SystemRoleName }
  | { success: false; error: ActionError }

export type SignInResult =
  | { success: true; user: unknown }
  | { success: false; error: ActionError }

export type SignOutResult =
  | { success: true }
  | { success: false; error: ActionError }

function toAuthError(error: any): ActionError {
  if (isTableMissingError(error)) {
    return {
      code: 'database_not_setup',
      message:
        'Database not set up yet. Run scripts/001_init_schema.sql, scripts/002_rbac_seed.sql, and scripts/003_minimal_rls.sql in Supabase.',
    }
  }

  const code = String(error?.code || '').trim() || 'unknown_error'
  const message = String(error?.message || error || 'Unknown error').trim() || 'Unknown error'

  const normalizedCode = code.toLowerCase()
  const normalizedMessage = message.toLowerCase()

  if (normalizedCode === 'email_not_confirmed' || normalizedMessage.includes('email not confirmed')) {
    return {
      code: 'email_not_confirmed',
      message:
        'Email not confirmed. Please check your inbox/spam for the verification email, confirm your account, then sign in again.',
    }
  }

  if (
    normalizedCode === 'invalid_login_credentials' ||
    normalizedMessage.includes('invalid login credentials') ||
    normalizedMessage.includes('invalid credentials')
  ) {
    return {
      code: 'invalid_login_credentials',
      message: 'Invalid email or password.',
    }
  }

  if (
    normalizedCode === 'user_already_exists' ||
    normalizedMessage.includes('user already registered') ||
    normalizedMessage.includes('already been registered')
  ) {
    return {
      code: 'user_already_exists',
      message: 'An account with this email already exists. Please sign in instead.',
    }
  }

  return { code, message }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeSchoolCode(code: string) {
  return code.trim().toUpperCase()
}

async function getOrCreatePlatformSchool() {
  const PLATFORM_CODE = 'PLATFORM'

  const { data: existing, error: existingError } = await admin
    .from('schools')
    .select('id, code, name')
    .eq('code', PLATFORM_CODE)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return existing

  const { data: created, error: createError } = await admin
    .from('schools')
    .insert({
      name: 'CBC Platform',
      code: PLATFORM_CODE,
      school_type: 'BOTH',
      curriculum_version: 'CBC2023',
      is_active: true,
    })
    .select('id, code, name')
    .single()

  if (createError) throw createError
  return created
}

function isAuthSessionMissingError(error: any) {
  const name = String(error?.name || '')
  const message = String(error?.message || '').toLowerCase()
  return name === 'AuthSessionMissingError' || message.includes('auth session missing')
}

function isTableMissingError(error: any) {
  const message = String(error?.message || '')
  return error?.code === '42P01' || message.includes('does not exist')
}

function pickPrimaryRole(roles: SystemRoleName[]): SystemRoleName {
  if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
  if (roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN'
  if (roles.includes('HEAD_TEACHER')) return 'HEAD_TEACHER'
  return 'TEACHER'
}

async function getOrBootstrapSchoolByCode(code: string, options?: { allowBootstrap?: boolean }) {
  const schoolCode = normalizeSchoolCode(code)

  if (!schoolCode) throw new Error('School code is required.')

  const { data: existingSchool, error: schoolError } = await admin
    .from('schools')
    .select('id, code, name')
    .eq('code', schoolCode)
    .maybeSingle()

  if (schoolError) throw schoolError

  if (existingSchool) return { school: existingSchool, didBootstrap: false }

  if (options?.allowBootstrap) {
    const { data: createdSchool, error: createError } = await admin
      .from('schools')
      .insert({
        name: `School ${schoolCode}`,
        code: schoolCode,
        school_type: 'SECONDARY',
        curriculum_version: 'CBC2023',
        is_active: true,
      })
      .select('id, code, name')
      .single()

    if (createError) throw createError
    return { school: createdSchool, didBootstrap: true }
  }

  const { count: schoolCount, error: countError } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true })

  if (countError) throw countError

  // Bootstrap: allow creating the very first school only
  if ((schoolCount ?? 0) === 0) {
    const { data: createdSchool, error: createError } = await admin
      .from('schools')
      .insert({
        name: `School ${schoolCode}`,
        code: schoolCode,
        school_type: 'SECONDARY',
        curriculum_version: 'CBC2023',
        is_active: true,
      })
      .select('id, code, name')
      .single()

    if (createError) throw createError
    return { school: createdSchool, didBootstrap: true }
  }

  const { data: knownSchools } = await admin
    .from('schools')
    .select('code')
    .order('created_at', { ascending: true })
    .limit(10)

  const knownCodes = (knownSchools ?? [])
    .map((s: any) => String(s.code || '').trim())
    .filter(Boolean)
    .join(', ')

  throw new Error(
    knownCodes
      ? `Invalid school code. Known school codes: ${knownCodes}.`
      : 'Invalid school code. Please enter an existing school code (schools.code) or ask your admin for the correct code.'
  )
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

export async function signUp(
  email: string,
  password: string,
  schoolCode: string,
  firstName: string,
  lastName: string
): Promise<SignUpResult> {
  try {
    const normalizedEmail = normalizeEmail(email)
    const normalizedSchoolCode = normalizeSchoolCode(schoolCode || '')
    const trimmedFirstName = firstName.trim()
    const trimmedLastName = lastName.trim()

    const { count: totalUsers, error: totalUsersError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })

    if (totalUsersError) throw totalUsersError

    const isFirstUserInSystem = (totalUsers ?? 0) === 0

    // Recovery-safe bootstrap: if there is no SUPER_ADMIN assigned yet, let the next signup
    // become the platform admin and attach them to a reserved PLATFORM school.
    let hasSuperAdmin = false
    try {
      const superAdminRoleId = await getSystemRoleId('SUPER_ADMIN')
      const { count: superAdminAssignments, error: superAdminAssignmentsError } = await admin
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('role_id', superAdminRoleId)

      if (superAdminAssignmentsError) throw superAdminAssignmentsError
      hasSuperAdmin = (superAdminAssignments ?? 0) > 0
    } catch {
      hasSuperAdmin = false
    }

    const shouldBootstrapPlatformAdmin = !hasSuperAdmin

    const school = shouldBootstrapPlatformAdmin
      ? await getOrCreatePlatformSchool()
      : (
          await getOrBootstrapSchoolByCode(normalizedSchoolCode, {
            allowBootstrap: false,
          })
        ).school

    const { count: schoolUsers, error: schoolUsersError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)

    if (schoolUsersError) throw schoolUsersError

    const isFirstUserInSchool = (schoolUsers ?? 0) === 0

    // Create Supabase auth user (email confirmation disabled for local dev)
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: undefined,
      },
    })

    if (authError) throw authError

    if (!authData.user) throw new Error('Failed to create user')

    // Create user record in database
    const { data: userData, error: userError } = await admin
      .from('users')
      .insert({
        id: authData.user.id,
        school_id: school.id,
        email: normalizedEmail,
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        status: 'ACTIVE',
        auth_id: authData.user.id,
      })
      .select()
      .single()

    if (userError) throw userError

    await ensureTeacherRow(authData.user.id, school.id)

    const roleToAssign: SystemRoleName = isFirstUserInSystem
      ? 'SUPER_ADMIN'
      : shouldBootstrapPlatformAdmin
        ? 'SUPER_ADMIN'
        : isFirstUserInSchool
          ? 'SCHOOL_ADMIN'
          : 'TEACHER'

    await assignSystemRole(authData.user.id, school.id, roleToAssign)

    return { success: true, user: userData as UserRow, role: roleToAssign }
  } catch (error) {
    console.error('Sign up error:', error)
    return { success: false, error: toAuthError(error) }
  }
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    })

    if (error) return { success: false, error: toAuthError(error) }

    if (data.user) {
      await admin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id)
    }

    return { success: true, user: data.user }
  } catch (error) {
    console.error('Sign in error:', error)
    return { success: false, error: toAuthError(error) }
  }
}

export async function signOut(): Promise<SignOutResult> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()
    if (error) return { success: false, error: toAuthError(error) }
    return { success: true } satisfies SignOutResult
  } catch (error) {
    console.error('Sign out error:', error)
    return { success: false, error: toAuthError(error) }
  }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    if (isAuthSessionMissingError(authError)) return null
    console.error('Get auth user error:', authError)
    return null
  }

  if (!user) return null

  try {
    const { data: userData, error: userError } = await admin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (userError) throw userError
    if (!userData) throw new Error('User profile not found')

    const { data: roleRows, error: roleError } = await admin
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id)

    if (roleError) throw roleError

    const roles = (roleRows ?? [])
      .map((row: any) => row?.roles?.name)
      .filter(Boolean) as SystemRoleName[]

    const primaryRole = pickPrimaryRole(roles)

    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id, name, code, is_active, logo_url')
      .eq('id', (userData as any).school_id)
      .maybeSingle()

    if (schoolError) throw schoolError

    return {
      ...(userData as UserRow),
      role: primaryRole,
      roles,
      school: school ?? null,
    } satisfies CurrentUser
  } catch (error) {
    console.error('Get current user profile error:', error)
    if (isTableMissingError(error)) redirect('/database-setup')
    redirect('/database-setup')
  }
}

export async function updateUser(userId: string, updates: Partial<UserRow>) {
  try {
    const { data, error } = await admin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    return { success: true, user: data }
  } catch (error) {
    console.error('Update user error:', error)
    throw error
  }
}

export async function getUserByEmail(email: string) {
  try {
    const { data, error } = await admin
      .from('users')
      .select('*')
      .eq('email', normalizeEmail(email))
      .single()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found

    return data as UserRow | null
  } catch (error) {
    console.error('Get user by email error:', error)
    return null
  }
}
