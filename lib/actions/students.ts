'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { autoAssignCompulsorySubjects } from '@/lib/actions/subject-selection'
import type { Database } from '@/lib/supabase/types'

type StudentRow = Database['public']['Tables']['students']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type StudentListItem = StudentRow

export type StudentsResult =
  | { success: true; students: StudentListItem[] }
  | { success: false; error: ActionError }

export type StudentResult =
  | { success: true; student: StudentListItem }
  | { success: false; error: ActionError }

export type StudentImportError = {
  row: number
  admission_number?: string
  message: string
}

export type StudentImportResult =
  | {
      success: true
      inserted: number
      skipped: number
      errors: StudentImportError[]
      compulsoryAssigned: boolean
    }
  | { success: false; error: ActionError }

function toActionError(error: any): ActionError {
  const message = String(error?.message || error || 'Unknown error').trim() || 'Unknown error'
  const code = String(error?.code || 'unknown_error').trim() || 'unknown_error'
  return { code, message }
}

function normalizeDateInput(value: string): { value: string | null; error?: string } {
  const raw = value.trim()
  if (!raw) return { value: null }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day) {
      return { value: raw }
    }
    return { value: null, error: 'Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.' }
  }

  const dmyMatch = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(raw)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const year = Number(dmyMatch[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day) {
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      return { value: `${year}-${mm}-${dd}` }
    }
    return { value: null, error: 'Invalid date. Use YYYY-MM-DD or DD/MM/YYYY.' }
  }

  return { value: null, error: 'Invalid date format. Use YYYY-MM-DD or DD/MM/YYYY.' }
}

async function requireSignedIn(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: { code: 'not_authenticated', message: 'Please sign in.' } }
  return { ok: true, user }
}

async function requireSchoolStaff(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth

  const isAllowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER' || auth.user.role === 'TEACHER'
  if (!isAllowed) {
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

async function getTeacherClassIds(teacherId: string, termId?: string) {
  let assignmentQuery = admin
    .from('teacher_class_assignments')
    .select('class_id')
    .eq('teacher_id', teacherId)

  let slotQuery = admin
    .from('timetable_slots')
    .select('class_id')
    .eq('teacher_id', teacherId)

  if (termId) {
    assignmentQuery = assignmentQuery.eq('academic_term_id', termId)
    slotQuery = slotQuery.eq('academic_term_id', termId)
  }

  const [{ data: assignments, error: assignmentError }, { data: slots, error: slotError }] = await Promise.all([
    assignmentQuery,
    slotQuery,
  ])
  if (assignmentError) throw assignmentError
  if (slotError) throw slotError

  const classIds = new Set<string>()
  ;(assignments ?? []).forEach((row: any) => row.class_id && classIds.add(row.class_id))
  ;(slots ?? []).forEach((row: any) => row.class_id && classIds.add(row.class_id))
  return Array.from(classIds)
}

async function validateClassAndTermOwnership(schoolId: string, classId: string, termId: string): Promise<ActionError | null> {
  const [{ data: classRow, error: classError }, { data: termRow, error: termError }] = await Promise.all([
    admin.from('classes').select('id, school_id').eq('id', classId).single(),
    admin.from('academic_terms').select('id, school_id').eq('id', termId).single(),
  ])

  if (classError || !classRow || classRow.school_id !== schoolId) {
    return { code: 'invalid_class', message: 'Selected class is invalid for this school.' }
  }

  if (termError || !termRow || termRow.school_id !== schoolId) {
    return { code: 'invalid_term', message: 'Selected academic term is invalid for this school.' }
  }

  return null
}

export async function getStudents(params?: {
  classId?: string
  termId?: string
  query?: string
}): Promise<StudentsResult> {
  const auth = await requireSchoolStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    let queryBuilder = admin
      .from('students')
      .select('*')
      .eq('school_id', auth.user.school_id)

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const classIds = await getTeacherClassIds(
        teacherId,
        params?.termId && params.termId !== 'all' ? params.termId : undefined
      )
      if (classIds.length === 0) {
        return { success: true, students: [] }
      }
      queryBuilder = queryBuilder.in('class_id', classIds)
    }

    if (params?.classId && params.classId !== 'all') {
      queryBuilder = queryBuilder.eq('class_id', params.classId)
    }

    if (params?.termId && params.termId !== 'all') {
      queryBuilder = queryBuilder.eq('academic_term_id', params.termId)
    }

    const search = params?.query?.trim()
    if (search) {
      const pattern = `%${search.replace(/[%_]/g, '')}%`
      queryBuilder = queryBuilder.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},admission_number.ilike.${pattern}`)
    }

    const { data, error } = await queryBuilder
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) throw error
    return { success: true, students: (data ?? []) as StudentListItem[] }
  } catch (error) {
    console.error('Get students error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function createStudent(input: {
  admission_number: string
  first_name: string
  last_name: string
  class_id: string
  academic_term_id: string
  gender?: string | null
  date_of_birth?: string | null
}): Promise<StudentResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const admission_number = input.admission_number.trim().toUpperCase()
    const first_name = input.first_name.trim()
    const last_name = input.last_name.trim()

    if (!admission_number || !first_name || !last_name || !input.class_id || !input.academic_term_id) {
      return { success: false, error: { code: 'invalid_input', message: 'Admission number, names, class and term are required.' } }
    }

    const ownershipError = await validateClassAndTermOwnership(auth.user.school_id, input.class_id, input.academic_term_id)
    if (ownershipError) return { success: false, error: ownershipError }

    const payload = {
      school_id: auth.user.school_id,
      admission_number,
      first_name,
      last_name,
      class_id: input.class_id,
      academic_term_id: input.academic_term_id,
      gender: input.gender?.trim() || null,
      date_of_birth: input.date_of_birth || null,
    }

    const { data, error } = await admin
      .from('students')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'students:create',
      resource_type: 'students',
      resource_id: data.id,
      changes: {
        admission_number,
        class_id: input.class_id,
        academic_term_id: input.academic_term_id,
      },
    })

    return { success: true, student: data as StudentListItem }
  } catch (error) {
    console.error('Create student error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateStudent(
  id: string,
  updates: {
    first_name?: string
    last_name?: string
    class_id?: string
    academic_term_id?: string
    gender?: string | null
    date_of_birth?: string | null
  }
): Promise<StudentResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: existing, error: existingError } = await admin
      .from('students')
      .select('*')
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .single()

    if (existingError || !existing) {
      return { success: false, error: { code: 'not_found', message: 'Student not found.' } }
    }

    const nextClassId = updates.class_id ?? existing.class_id
    const nextTermId = updates.academic_term_id ?? existing.academic_term_id

    const ownershipError = await validateClassAndTermOwnership(auth.user.school_id, nextClassId, nextTermId)
    if (ownershipError) return { success: false, error: ownershipError }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof updates.first_name === 'string') payload.first_name = updates.first_name.trim()
    if (typeof updates.last_name === 'string') payload.last_name = updates.last_name.trim()
    if (typeof updates.class_id === 'string') payload.class_id = updates.class_id
    if (typeof updates.academic_term_id === 'string') payload.academic_term_id = updates.academic_term_id
    if (typeof updates.gender !== 'undefined') payload.gender = updates.gender?.trim() || null
    if (typeof updates.date_of_birth !== 'undefined') payload.date_of_birth = updates.date_of_birth || null

    if (payload.first_name === '' || payload.last_name === '') {
      return { success: false, error: { code: 'invalid_input', message: 'First name and last name are required.' } }
    }

    const { data, error } = await admin
      .from('students')
      .update(payload)
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'students:update',
      resource_type: 'students',
      resource_id: id,
      changes: payload,
    })

    return { success: true, student: data as StudentListItem }
  } catch (error) {
    console.error('Update student error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function importStudentsCsv(input: {
  class_id: string
  academic_term_id: string
  rows: Array<{
    admission_number?: string | null
    first_name?: string | null
    last_name?: string | null
    gender?: string | null
    date_of_birth?: string | null
  }>
  auto_assign_compulsory?: boolean
}): Promise<StudentImportResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (!input.class_id || !input.academic_term_id) {
      return { success: false, error: { code: 'invalid_input', message: 'Class and term are required.' } }
    }

    const ownershipError = await validateClassAndTermOwnership(auth.user.school_id, input.class_id, input.academic_term_id)
    if (ownershipError) return { success: false, error: ownershipError }

    const errors: StudentImportError[] = []
    const normalizedRows: Array<{
      admission_number: string
      first_name: string
      last_name: string
      gender: string | null
      date_of_birth: string | null
    }> = []

    const seenAdmissions = new Set<string>()

    input.rows.forEach((row, index) => {
      const admission = String(row.admission_number || '').trim().toUpperCase()
      const first = String(row.first_name || '').trim()
      const last = String(row.last_name || '').trim()
      const gender = row.gender ? String(row.gender).trim() : ''
      const dateRaw = row.date_of_birth ? String(row.date_of_birth).trim() : ''
      const { value: normalizedDate, error: dateError } = normalizeDateInput(dateRaw)

      if (!admission || !first || !last) {
        errors.push({
          row: index + 1,
          admission_number: admission || undefined,
          message: 'Admission number, first name and last name are required.',
        })
        return
      }

      if (seenAdmissions.has(admission)) {
        errors.push({
          row: index + 1,
          admission_number: admission,
          message: 'Duplicate admission number in CSV.',
        })
        return
      }

      if (dateError) {
        errors.push({
          row: index + 1,
          admission_number: admission,
          message: dateError,
        })
        return
      }

      seenAdmissions.add(admission)
      normalizedRows.push({
        admission_number: admission,
        first_name: first,
        last_name: last,
        gender: gender || null,
        date_of_birth: normalizedDate,
      })
    })

    if (normalizedRows.length === 0) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        errors: errors.length > 0 ? errors : [{ row: 0, message: 'No valid student rows found.' }],
        compulsoryAssigned: false,
      }
    }

    const admissions = normalizedRows.map((row) => row.admission_number)
    const { data: existing, error: existingError } = await admin
      .from('students')
      .select('admission_number')
      .eq('school_id', auth.user.school_id)
      .in('admission_number', admissions)

    if (existingError) throw existingError

    const existingSet = new Set((existing ?? []).map((row: any) => String(row.admission_number).toUpperCase()))

    const toInsert = normalizedRows.filter((row) => !existingSet.has(row.admission_number))
    const skipped = normalizedRows.length - toInsert.length

    const insertPayload = toInsert.map((row) => ({
      school_id: auth.user.school_id,
      admission_number: row.admission_number,
      first_name: row.first_name,
      last_name: row.last_name,
      gender: row.gender,
      date_of_birth: row.date_of_birth,
      class_id: input.class_id,
      academic_term_id: input.academic_term_id,
    }))

    if (insertPayload.length > 0) {
      const { error: insertError } = await admin.from('students').insert(insertPayload)
      if (insertError) throw insertError
    }

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'students:import_csv',
      resource_type: 'students',
      changes: {
        class_id: input.class_id,
        academic_term_id: input.academic_term_id,
        inserted: insertPayload.length,
        skipped,
      },
    })

    let compulsoryAssigned = false
    if (input.auto_assign_compulsory) {
      const compulsoryResult = await autoAssignCompulsorySubjects({
        classId: input.class_id,
        termId: input.academic_term_id,
      })

      if (!compulsoryResult.success) {
        errors.push({
          row: 0,
          message: `Compulsory subject auto-assign failed: ${compulsoryResult.error.message}`,
        })
      } else {
        compulsoryAssigned = true
      }
    }

    return {
      success: true,
      inserted: insertPayload.length,
      skipped,
      errors,
      compulsoryAssigned,
    }
  } catch (error) {
    console.error('Import students CSV error:', error)
    return { success: false, error: toActionError(error) }
  }
}
