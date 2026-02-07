'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type ClassRow = Database['public']['Tables']['classes']['Row']
type StudentRow = Database['public']['Tables']['students']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type ClassesResult =
  | { success: true; classes: ClassRow[] }
  | { success: false; error: ActionError }

export type ClassResult =
  | { success: true; class: ClassRow }
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

async function requireSchoolAdmin(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN') {
    return { ok: false, error: { code: 'forbidden', message: 'School admin access required.' } }
  }
  return auth
}

export async function createClass(input: {
  name: string
  grade_level: number
  stream?: string | null
  capacity?: number | null
}): Promise<ClassResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const name = input.name.trim()
    if (!name) return { success: false, error: { code: 'invalid_input', message: 'Class name is required.' } }

    const { data: classData, error } = await admin
      .from('classes')
      .insert({
        school_id: auth.user.school_id,
        name,
        grade_level: input.grade_level,
        stream: input.stream?.trim() || null,
        capacity: input.capacity ?? null,
        is_active: true,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'classes:create',
      resource_type: 'classes',
      resource_id: classData.id,
      changes: { name, grade_level: input.grade_level, stream: input.stream ?? null },
    })

    return { success: true, class: classData as ClassRow }
  } catch (error) {
    console.error('Create class error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getClasses(params?: {
  schoolId?: string
  includeInactive?: boolean
}): Promise<ClassesResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const schoolId = auth.user.role === 'SUPER_ADMIN' && params?.schoolId ? params.schoolId : auth.user.school_id
    const includeInactive = params?.includeInactive ?? false

    const supabase = await createClient()
    let query = supabase.from('classes').select('*').eq('school_id', schoolId)

    if (!includeInactive) query = query.eq('is_active', true)

    const { data: classes, error } = await query
      .order('grade_level', { ascending: true })

    if (error) throw error
    return { success: true, classes: (classes ?? []) as ClassRow[] }
  } catch (error) {
    console.error('Get classes error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getClassById(id: string) {
  try {
    const supabase = await createClient()
    const { data: classData, error } = await supabase
      .from('classes')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return classData as ClassRow
  } catch (error) {
    console.error('Get class by id error:', error)
    return null
  }
}

export async function updateClass(id: string, updates: Partial<ClassRow>): Promise<ClassResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: classData, error } = await admin
      .from('classes')
      .update(updates)
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'classes:update',
      resource_type: 'classes',
      resource_id: classData.id,
      changes: updates,
    })

    return { success: true, class: classData as ClassRow }
  } catch (error) {
    console.error('Update class error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteClass(id: string): Promise<ClassResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: classData, error } = await admin
      .from('classes')
      .update({ is_active: false })
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'classes:archive',
      resource_type: 'classes',
      resource_id: classData.id,
      changes: { is_active: false },
    })

    return { success: true, class: classData as ClassRow }
  } catch (error) {
    console.error('Delete class error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getClassStudents(classId: string) {
  try {
    const supabase = await createClient()
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)

    if (error) throw error
    return (students ?? []) as StudentRow[]
  } catch (error) {
    console.error('Get class students error:', error)
    return []
  }
}
