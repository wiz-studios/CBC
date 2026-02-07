'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type SchoolRow = Database['public']['Tables']['schools']['Row']
type AcademicTermRow = Database['public']['Tables']['academic_terms']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

type ActionError = {
  code: string
  message: string
}

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type SchoolWithStatus = SchoolRow & {
  active_users_count: number
  last_activity_at: string | null
  current_term: Pick<AcademicTermRow, 'id' | 'year' | 'term' | 'term_name'> | null
}

export type SchoolsResult =
  | { success: true; schools: SchoolWithStatus[] }
  | { success: false; error: ActionError }

export type SchoolResult =
  | { success: true; school: SchoolRow }
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

async function requireSuperAdmin(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SUPER_ADMIN') {
    return { ok: false, error: { code: 'forbidden', message: 'Super admin access required.' } }
  }
  return auth
}

export async function getSchools(params?: {
  query?: string
  status?: 'active' | 'suspended' | 'all'
  includePlatform?: boolean
}): Promise<SchoolsResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const query = params?.query?.trim()
    const status = params?.status ?? 'all'
    const includePlatform = params?.includePlatform ?? false

    let schoolsQuery = admin
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false })

    if (!includePlatform) {
      schoolsQuery = schoolsQuery.neq('code', 'PLATFORM')
    }

    if (status !== 'all') {
      schoolsQuery = schoolsQuery.eq('is_active', status === 'active')
    }

    if (query) {
      const q = query.replace(/%/g, '\\%').replace(/_/g, '\\_')
      schoolsQuery = schoolsQuery.or(`name.ilike.%${q}%,code.ilike.%${q}%,county.ilike.%${q}%`)
    }

    const { data: schools, error: schoolsError } = await schoolsQuery
    if (schoolsError) throw schoolsError

    const { data: users, error: usersError } = await admin
      .from('users')
      .select('id, school_id, status, last_login')

    if (usersError) throw usersError

    const { data: currentTerms, error: termsError } = await admin
      .from('academic_terms')
      .select('id, school_id, year, term, term_name, is_current')
      .eq('is_current', true)

    if (termsError) throw termsError

    const currentTermBySchool = new Map<string, SchoolWithStatus['current_term']>()
    ;(currentTerms ?? []).forEach((term) => {
      currentTermBySchool.set(term.school_id, {
        id: term.id,
        year: term.year,
        term: term.term,
        term_name: term.term_name,
      })
    })

    const userRows = (users ?? []) as Pick<UserRow, 'id' | 'school_id' | 'status' | 'last_login'>[]
    const counts = new Map<string, number>()
    const lastActivity = new Map<string, string | null>()

    for (const row of userRows) {
      if (row.status === 'ACTIVE') {
        counts.set(row.school_id, (counts.get(row.school_id) ?? 0) + 1)
      }
      if (row.last_login) {
        const prev = lastActivity.get(row.school_id)
        if (!prev || new Date(row.last_login) > new Date(prev)) {
          lastActivity.set(row.school_id, row.last_login)
        }
      }
    }

    const enriched: SchoolWithStatus[] = ((schools ?? []) as SchoolRow[]).map((school) => ({
      ...school,
      active_users_count: counts.get(school.id) ?? 0,
      last_activity_at: lastActivity.get(school.id) ?? null,
      current_term: currentTermBySchool.get(school.id) ?? null,
    }))

    return { success: true, schools: enriched }
  } catch (error) {
    console.error('Get schools error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getMySchool(): Promise<SchoolResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { data: school, error } = await supabase
      .from('schools')
      .select('*')
      .eq('id', auth.user.school_id)
      .single()

    if (error) throw error
    return { success: true, school: school as SchoolRow }
  } catch (error) {
    console.error('Get my school error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function createSchool(input: {
  name: string
  code: string
  school_type: SchoolRow['school_type']
  county?: string
  sub_county?: string
  principal_name?: string
  principal_email?: string
  phone?: string
  address?: string
  motto?: string
}): Promise<SchoolResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const name = input.name.trim()
    const code = input.code.trim().toUpperCase()
    if (!name) return { success: false, error: { code: 'invalid_input', message: 'School name is required.' } }
    if (!code) return { success: false, error: { code: 'invalid_input', message: 'School code is required.' } }

    const { data: school, error } = await admin
      .from('schools')
      .insert({
        name,
        code,
        school_type: input.school_type,
        county: input.county?.trim() || null,
        sub_county: input.sub_county?.trim() || null,
        principal_name: input.principal_name?.trim() || null,
        principal_email: input.principal_email?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        motto: input.motto?.trim() || null,
        curriculum_version: 'CBC2023',
        is_active: true,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: school.id,
      user_id: auth.user.id,
      action: 'schools:create',
      resource_type: 'schools',
      resource_id: school.id,
      changes: { name, code, school_type: input.school_type },
    })

    return { success: true, school: school as SchoolRow }
  } catch (error) {
    console.error('Create school error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function setSchoolActive(
  schoolId: string,
  isActive: boolean,
  reason?: string
): Promise<SchoolResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: school, error } = await admin
      .from('schools')
      .update({ is_active: isActive })
      .eq('id', schoolId)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: school.id,
      user_id: auth.user.id,
      action: isActive ? 'schools:reactivate' : 'schools:suspend',
      resource_type: 'schools',
      resource_id: school.id,
      changes: { is_active: isActive, reason: reason?.trim() || null },
    })

    return { success: true, school: school as SchoolRow }
  } catch (error) {
    console.error('Set school active error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteSchool(schoolId: string, confirmCode: string, reason?: string): Promise<SchoolResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: existing, error: existingError } = await admin
      .from('schools')
      .select('id, code')
      .eq('id', schoolId)
      .single()

    if (existingError) throw existingError
    if (!existing) throw new Error('School not found')

    const expected = String(existing.code || '').trim().toUpperCase()
    const provided = String(confirmCode || '').trim().toUpperCase()
    if (!expected || provided !== expected) {
      return { success: false, error: { code: 'invalid_confirmation', message: 'Confirmation code does not match.' } }
    }

    const now = new Date().toISOString()
    let updatedSchool: any = null

    const softDeleteAttempt = await admin
      .from('schools')
      .update({ is_active: false, deleted_at: now } as any)
      .eq('id', schoolId)
      .select('*')
      .single()

    if (softDeleteAttempt.error) {
      const msg = String(softDeleteAttempt.error.message || '')
      const isMissingColumn = msg.includes('deleted_at') && msg.toLowerCase().includes('does not exist')
      if (!isMissingColumn) throw softDeleteAttempt.error

      const hardFallback = await admin
        .from('schools')
        .update({ is_active: false } as any)
        .eq('id', schoolId)
        .select('*')
        .single()

      if (hardFallback.error) throw hardFallback.error
      updatedSchool = hardFallback.data
    } else {
      updatedSchool = softDeleteAttempt.data
    }

    await admin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: auth.user.id,
      action: 'schools:delete',
      resource_type: 'schools',
      resource_id: schoolId,
      changes: { is_active: false, deleted_at: now, reason: reason?.trim() || null },
    })

    return { success: true, school: updatedSchool as SchoolRow }
  } catch (error) {
    console.error('Delete school error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateSchool(schoolId: string, updates: Partial<SchoolRow>): Promise<SchoolResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const patch: Partial<SchoolRow> = {}
    const allowedKeys: (keyof SchoolRow)[] = [
      'name',
      'motto',
      'principal_name',
      'principal_email',
      'phone',
      'address',
      'county',
      'sub_county',
      'school_type',
      'curriculum_version',
      'is_active',
    ]

    for (const key of allowedKeys) {
      if (key in updates) {
        ;(patch as any)[key] = (updates as any)[key]
      }
    }

    if (Object.keys(patch).length === 0) {
      return { success: false, error: { code: 'invalid_input', message: 'No changes provided.' } }
    }

    const { data: school, error } = await admin
      .from('schools')
      .update(patch)
      .eq('id', schoolId)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: auth.user.id,
      action: 'schools:update',
      resource_type: 'schools',
      resource_id: schoolId,
      changes: patch,
    })

    return { success: true, school: school as SchoolRow }
  } catch (error) {
    console.error('Update school error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateMySchool(updates: Partial<SchoolRow>): Promise<SchoolResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const isAllowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'SUPER_ADMIN'
    if (!isAllowed) {
      return { success: false, error: { code: 'forbidden', message: 'Only admins can update school settings.' } }
    }

    const patch: Partial<SchoolRow> = {}
    const allowedKeys: (keyof SchoolRow)[] = [
      'name',
      'motto',
      'principal_name',
      'principal_email',
      'phone',
      'address',
      'county',
      'sub_county',
      'school_type',
      'curriculum_version',
    ]

    for (const key of allowedKeys) {
      if (key in updates) {
        ;(patch as any)[key] = (updates as any)[key]
      }
    }

    const { data: school, error } = await admin
      .from('schools')
      .update(patch)
      .eq('id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: school.id,
      user_id: auth.user.id,
      action: 'schools:update',
      resource_type: 'schools',
      resource_id: school.id,
      changes: patch,
    })

    return { success: true, school: school as SchoolRow }
  } catch (error) {
    console.error('Update my school error:', error)
    return { success: false, error: toActionError(error) }
  }
}
