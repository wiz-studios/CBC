'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type AssessmentTypeRow = Database['public']['Tables']['assessment_types']['Row']
type AssessmentRow = Database['public']['Tables']['assessments']['Row']
type StudentRow = Database['public']['Tables']['students']['Row']
type StudentMarkRow = Database['public']['Tables']['student_marks']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type AssessmentTypesResult =
  | { success: true; assessmentTypes: AssessmentTypeRow[] }
  | { success: false; error: ActionError }

export type AssessmentsResult =
  | { success: true; assessments: AssessmentRow[] }
  | { success: false; error: ActionError }

export type AssessmentTypeResult =
  | { success: true; assessmentType: AssessmentTypeRow }
  | { success: false; error: ActionError }

export type AssessmentResult =
  | { success: true; assessment: AssessmentRow }
  | { success: false; error: ActionError }

export type AssessmentMarksResult =
  | {
      success: true
      assessment: Pick<
        AssessmentRow,
        'id' | 'title' | 'class_id' | 'subject_id' | 'academic_term_id' | 'max_score' | 'teacher_id' | 'assessment_date'
      >
      students: StudentRow[]
      marks: Array<Pick<StudentMarkRow, 'student_id' | 'score'>>
    }
  | { success: false; error: ActionError }

export type AssessmentPerformanceRow = {
  id: string
  title: string
  max_score: number
  count: number
  average: number
}

export type AssessmentPerformanceResult =
  | { success: true; rows: AssessmentPerformanceRow[] }
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

async function requireStaff(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN' && auth.user.role !== 'HEAD_TEACHER' && auth.user.role !== 'TEACHER') {
    return { ok: false, error: { code: 'forbidden', message: 'Staff access required.' } }
  }
  return auth
}

async function requireSchoolAdminOrHeadTeacher(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN' && auth.user.role !== 'HEAD_TEACHER') {
    return { ok: false, error: { code: 'forbidden', message: 'Admin access required.' } }
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

export async function getAssessmentTypes(): Promise<AssessmentTypesResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('assessment_types')
      .select('*')
      .eq('school_id', auth.user.school_id)
      .order('created_at', { ascending: true })

    if (error) throw error
    return { success: true, assessmentTypes: (data ?? []) as AssessmentTypeRow[] }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function createAssessmentType(input: {
  name: string
  weight: number
  max_score?: number | null
}): Promise<AssessmentTypeResult> {
  const auth = await requireSchoolAdminOrHeadTeacher()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const name = input.name.trim()
    if (!name) return { success: false, error: { code: 'invalid_input', message: 'Name is required.' } }

    const weight = Number(input.weight)
    if (!Number.isFinite(weight) || weight <= 0) {
      return { success: false, error: { code: 'invalid_input', message: 'Weight must be a positive number.' } }
    }

    const maxScore = input.max_score == null ? null : Number(input.max_score)
    if (maxScore != null && (!Number.isFinite(maxScore) || maxScore <= 0)) {
      return { success: false, error: { code: 'invalid_input', message: 'Max score must be a positive number.' } }
    }

    const { data, error } = await admin
      .from('assessment_types')
      .insert({
        school_id: auth.user.school_id,
        name,
        weight,
        max_score: maxScore,
        is_active: true,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'assessment_types:create',
      resource_type: 'assessment_types',
      resource_id: data.id,
      changes: { name, weight, max_score: maxScore },
    })

    return { success: true, assessmentType: data as AssessmentTypeRow }
  } catch (error) {
    console.error('Create assessment type error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateAssessmentType(
  id: string,
  updates: Partial<Pick<AssessmentTypeRow, 'name' | 'weight' | 'max_score' | 'is_active'>>
): Promise<AssessmentTypeResult> {
  const auth = await requireSchoolAdminOrHeadTeacher()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const safeUpdates: any = { ...updates }
    if (typeof safeUpdates.name === 'string') safeUpdates.name = safeUpdates.name.trim()

    const { data, error } = await admin
      .from('assessment_types')
      .update(safeUpdates)
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'assessment_types:update',
      resource_type: 'assessment_types',
      resource_id: id,
      changes: safeUpdates,
    })

    return { success: true, assessmentType: data as AssessmentTypeRow }
  } catch (error) {
    console.error('Update assessment type error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getAssessments(params?: {
  academicTermId?: string
  classId?: string
  subjectId?: string
}): Promise<AssessmentsResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()
    let query = supabase.from('assessments').select('*')

    if (params?.academicTermId) query = query.eq('academic_term_id', params.academicTermId)
    if (params?.classId) query = query.eq('class_id', params.classId)
    if (params?.subjectId) query = query.eq('subject_id', params.subjectId)

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      query = query.eq('teacher_id', teacherId)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
    if (error) throw error

    return { success: true, assessments: (data ?? []) as AssessmentRow[] }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

export async function createAssessment(input: {
  academic_term_id: string
  class_id: string
  subject_id: string
  assessment_type_id: string
  title: string
  assessment_date?: string | null
  max_score?: number | null
  teacher_id?: string | null
}): Promise<AssessmentResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const title = input.title.trim()
    if (!title) return { success: false, error: { code: 'invalid_input', message: 'Title is required.' } }

    const teacherId =
      auth.user.role === 'TEACHER'
        ? await getTeacherIdForUser(auth.user.id, auth.user.school_id)
        : (input.teacher_id ?? '').trim()

    if (!teacherId) {
      return { success: false, error: { code: 'invalid_input', message: 'Teacher is required.' } }
    }

    const { data: assessmentType, error: typeError } = await admin
      .from('assessment_types')
      .select('max_score')
      .eq('id', input.assessment_type_id)
      .eq('school_id', auth.user.school_id)
      .maybeSingle()

    if (typeError) throw typeError

    const inferredMax = assessmentType?.max_score ?? null
    const maxScoreRaw = input.max_score == null ? inferredMax ?? 100 : Number(input.max_score)
    const maxScore = Number.isFinite(maxScoreRaw as any) ? (maxScoreRaw as number) : 100

    const { data, error } = await admin
      .from('assessments')
      .insert({
        academic_term_id: input.academic_term_id,
        class_id: input.class_id,
        subject_id: input.subject_id,
        teacher_id: teacherId,
        assessment_type_id: input.assessment_type_id,
        title,
        description: null,
        assessment_date: input.assessment_date ?? null,
        max_score: maxScore,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'assessments:create',
      resource_type: 'assessments',
      resource_id: data.id,
      changes: { title, class_id: input.class_id, subject_id: input.subject_id, academic_term_id: input.academic_term_id },
    })

    return { success: true, assessment: data as AssessmentRow }
  } catch (error) {
    console.error('Create assessment error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteAssessment(assessmentId: string): Promise<AssessmentResult> {
  const auth = await requireSchoolAdminOrHeadTeacher()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data, error } = await admin
      .from('assessments')
      .delete()
      .eq('id', assessmentId)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'assessments:delete',
      resource_type: 'assessments',
      resource_id: assessmentId,
      changes: { id: assessmentId },
    })

    return { success: true, assessment: data as AssessmentRow }
  } catch (error) {
    console.error('Delete assessment error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getAssessmentMarks(assessmentId: string): Promise<AssessmentMarksResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, title, class_id, subject_id, academic_term_id, max_score, teacher_id, assessment_date')
      .eq('id', assessmentId)
      .single()

    if (assessmentError) throw assessmentError

    const { data: classStudents, error: studentsError } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', (assessment as any).class_id)
      .eq('academic_term_id', (assessment as any).academic_term_id)
      .order('admission_number', { ascending: true })

    if (studentsError) throw studentsError

    const studentRows = (classStudents ?? []) as StudentRow[]
    const studentIds = studentRows.map((student) => student.id)

    let allowedStudentIdSet = new Set<string>()
    if (studentIds.length > 0) {
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('student_subject_enrollments')
        .select('student_id')
        .eq('school_id', auth.user.school_id)
        .eq('term_id', (assessment as any).academic_term_id)
        .eq('subject_id', (assessment as any).subject_id)
        .eq('status', 'ACTIVE')
        .in('student_id', studentIds)
      if (enrollmentsError) throw enrollmentsError
      allowedStudentIdSet = new Set((enrollments ?? []).map((row: any) => row.student_id as string))
    }

    const students =
      allowedStudentIdSet.size === 0
        ? []
        : studentRows.filter((student) => allowedStudentIdSet.has(student.id))

    const { data: marks, error: marksError } = await supabase
      .from('student_marks')
      .select('student_id, score')
      .eq('assessment_id', assessmentId)

    if (marksError) throw marksError

    return {
      success: true,
      assessment: assessment as any,
      students,
      marks: ((marks ?? []) as any[])
        .filter((mark) => students.some((student) => student.id === mark.student_id))
        .map((m) => ({ student_id: m.student_id, score: m.score })),
    }
  } catch (error) {
    console.error('Get assessment marks error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function upsertStudentMarksBulk(
  assessmentId: string,
  entries: Array<{ student_id: string; score: number }>
): Promise<{ success: true } | { success: false; error: ActionError }> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: assessment, error: assessmentError } = await admin
      .from('assessments')
      .select('id, teacher_id, max_score, academic_term_id, class_id, subject_id')
      .eq('id', assessmentId)
      .single()

    if (assessmentError) throw assessmentError

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      if ((assessment as any).teacher_id !== teacherId) {
        return { success: false, error: { code: 'forbidden', message: 'You can only enter marks for your assessments.' } }
      }
    }

    const maxScore = Number((assessment as any).max_score ?? 100)
    const now = new Date().toISOString()

    const clean = entries
      .map((e) => ({ student_id: e.student_id, score: Number(e.score) }))
      .filter((e) => e.student_id && Number.isFinite(e.score))

    for (const row of clean) {
      if (row.score < 0 || row.score > maxScore) {
        return {
          success: false,
          error: { code: 'invalid_score', message: `Score must be between 0 and ${maxScore}.` },
        }
      }
    }

    if (clean.length === 0) {
      return { success: false, error: { code: 'invalid_input', message: 'No marks to save.' } }
    }

    const { data: classStudents, error: classStudentsError } = await admin
      .from('students')
      .select('id')
      .eq('class_id', (assessment as any).class_id)
      .eq('academic_term_id', (assessment as any).academic_term_id)
    if (classStudentsError) throw classStudentsError

    const classStudentIds = (classStudents ?? []).map((row: any) => row.id as string)
    if (classStudentIds.length === 0) {
      return { success: false, error: { code: 'no_students', message: 'No students found for this class and term.' } }
    }

    const { data: enrollments, error: enrollmentError } = await admin
      .from('student_subject_enrollments')
      .select('student_id')
      .eq('school_id', auth.user.school_id)
      .eq('term_id', (assessment as any).academic_term_id)
      .eq('subject_id', (assessment as any).subject_id)
      .eq('status', 'ACTIVE')
      .in('student_id', classStudentIds)
    if (enrollmentError) throw enrollmentError

    const allowedStudentIds = new Set((enrollments ?? []).map((row: any) => row.student_id as string))
    if (allowedStudentIds.size === 0) {
      return {
        success: false,
        error: {
          code: 'no_enrollments',
          message: 'No enrolled students found for this subject. Assign subject selections first.',
        },
      }
    }

    const allowedClean = clean.filter((row) => allowedStudentIds.has(row.student_id))
    if (allowedClean.length === 0) {
      return {
        success: false,
        error: {
          code: 'no_valid_entries',
          message: 'None of the submitted marks belong to enrolled students for this subject.',
        },
      }
    }

    const { error } = await admin.from('student_marks').upsert(
      allowedClean.map((e) => ({
        assessment_id: assessmentId,
        student_id: e.student_id,
        score: e.score,
        marked_at: now,
        updated_at: now,
      })),
      { onConflict: 'student_id,assessment_id' }
    )

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'marks:upsert_bulk',
      resource_type: 'assessments',
      resource_id: assessmentId,
      changes: { assessment_id: assessmentId, count: allowedClean.length },
    })

    return { success: true }
  } catch (error) {
    console.error('Upsert student marks bulk error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getAssessmentPerformance(params?: {
  academicTermId?: string
  classId?: string
  subjectId?: string
}): Promise<AssessmentPerformanceResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()

    let query = supabase.from('assessments').select('id, title, max_score, teacher_id, academic_term_id, class_id, subject_id')

    if (params?.academicTermId) query = query.eq('academic_term_id', params.academicTermId)
    if (params?.classId) query = query.eq('class_id', params.classId)
    if (params?.subjectId) query = query.eq('subject_id', params.subjectId)

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      query = query.eq('teacher_id', teacherId)
    }

    const { data: assessments, error: assessmentError } = await query.order('created_at', { ascending: false }).limit(200)
    if (assessmentError) throw assessmentError

    const rows = (assessments ?? []) as Array<Pick<AssessmentRow, 'id' | 'title' | 'max_score'>>
    if (rows.length === 0) return { success: true, rows: [] }

    const assessmentIds = rows.map((r) => r.id)
    const { data: marks, error: marksError } = await supabase
      .from('student_marks')
      .select('assessment_id, score')
      .in('assessment_id', assessmentIds)

    if (marksError) throw marksError

    const totals = new Map<string, { sum: number; count: number }>()
    ;(marks ?? []).forEach((m: any) => {
      const current = totals.get(m.assessment_id) ?? { sum: 0, count: 0 }
      current.sum += Number(m.score ?? 0)
      current.count += 1
      totals.set(m.assessment_id, current)
    })

    const performance = rows.map((a) => {
      const stats = totals.get(a.id) ?? { sum: 0, count: 0 }
      const avg = stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0
      return {
        id: a.id,
        title: a.title,
        max_score: Number(a.max_score ?? 100),
        count: stats.count,
        average: avg,
      } satisfies AssessmentPerformanceRow
    })

    return { success: true, rows: performance }
  } catch (error) {
    console.error('Get assessment performance error:', error)
    return { success: false, error: toActionError(error) }
  }
}
