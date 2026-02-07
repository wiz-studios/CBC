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

async function requireSchoolStaff(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  const allowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER' || auth.user.role === 'TEACHER'
  if (!allowed) {
    return { ok: false, error: { code: 'forbidden', message: 'School staff access required.' } }
  }
  return auth
}

async function requireSchoolAdmin(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN') {
    return { ok: false, error: { code: 'forbidden', message: 'School admin access required.' } }
  }
  return auth
}

async function getTeacherIdForUser(userId: string, schoolId: string) {
  const { data: teacher, error } = await admin
    .from('teachers')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (error) throw error
  if (!teacher) throw new Error('Teacher profile not found for this user.')
  return (teacher as any).id as string
}

async function getTeacherClassIds(teacherId: string) {
  const [{ data: assignments, error: assignmentError }, { data: slots, error: slotError }] = await Promise.all([
    admin
      .from('teacher_class_assignments')
      .select('class_id')
      .eq('teacher_id', teacherId),
    admin
      .from('timetable_slots')
      .select('class_id')
      .eq('teacher_id', teacherId),
  ])
  if (assignmentError) throw assignmentError
  if (slotError) throw slotError

  const classIds = new Set<string>()
  ;(assignments ?? []).forEach((row: any) => row.class_id && classIds.add(row.class_id))
  ;(slots ?? []).forEach((row: any) => row.class_id && classIds.add(row.class_id))
  return Array.from(classIds)
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
  const auth = await requireSchoolStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const schoolId = auth.user.school_id
    const includeInactive = params?.includeInactive ?? false

    const supabase = await createClient()
    let query = supabase.from('classes').select('*').eq('school_id', schoolId)

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const classIds = await getTeacherClassIds(teacherId)
      if (classIds.length === 0) {
        return { success: true, classes: [] }
      }
      query = query.in('id', classIds)
    }

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
    const auth = await requireSchoolStaff()
    if (!auth.ok) return null

    const supabase = await createClient()
    const { data: classData, error } = await supabase.from('classes').select('*').eq('id', id).single()

    if (error) throw error
    if (!classData || (classData as any).school_id !== auth.user.school_id) return null

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const classIds = await getTeacherClassIds(teacherId)
      if (!classIds.includes((classData as any).id)) return null
    }

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
    const auth = await requireSchoolStaff()
    if (!auth.ok) return []

    const supabase = await createClient()

    const { data: classRow, error: classError } = await supabase
      .from('classes')
      .select('id, school_id')
      .eq('id', classId)
      .single()
    if (classError || !classRow || (classRow as any).school_id !== auth.user.school_id) {
      return []
    }

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const classIds = await getTeacherClassIds(teacherId)
      if (!classIds.includes(classId)) {
        return []
      }
    }

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
