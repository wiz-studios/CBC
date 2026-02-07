'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type StudentRow = Database['public']['Tables']['students']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type EnrollmentRow = Database['public']['Tables']['student_subject_enrollments']['Row']
type ResultsSettingsRow = Database['public']['Tables']['school_results_settings']['Row']

type ActionError = { code: string; message: string }
type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

const CORE_CODES = ['ENG', 'KIS', 'MATH', 'CSL']

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

async function requireSchoolAdminOrHeadTeacher(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN' && auth.user.role !== 'HEAD_TEACHER') {
    return { ok: false, error: { code: 'forbidden', message: 'Admin access required.' } }
  }
  return auth
}

type SelectionStudent = Pick<StudentRow, 'id' | 'admission_number' | 'first_name' | 'last_name' | 'class_id'>
type SelectionSubject = Pick<SubjectRow, 'id' | 'code' | 'name' | 'curriculum_area' | 'is_compulsory'>

export type SubjectSelectionSetupResult =
  | {
      success: true
      students: SelectionStudent[]
      subjects: SelectionSubject[]
      compulsorySubjectIds: string[]
      enrollments: EnrollmentRow[]
      rules: Pick<
        ResultsSettingsRow,
        'min_total_subjects' | 'max_total_subjects' | 'min_sciences' | 'max_humanities' | 'ranking_method' | 'ranking_n'
      > | null
    }
  | { success: false; error: ActionError }

async function getClassStudents(termId: string, classId: string) {
  const { data: students, error: studentsError } = await admin
    .from('students')
    .select('id, admission_number, first_name, last_name, class_id')
    .eq('class_id', classId)
    .eq('academic_term_id', termId)
    .order('admission_number', { ascending: true })
  if (studentsError) throw studentsError
  return (students ?? []) as SelectionStudent[]
}

async function getClassOfferedSubjects(classId: string, schoolId: string) {
  const { data: classSubjects, error: classSubjectsError } = await admin
    .from('class_subjects')
    .select('subject_id, subjects!inner(id, code, name, curriculum_area, is_compulsory, school_id)')
    .eq('class_id', classId)
  if (classSubjectsError) throw classSubjectsError

  const fromClass = (classSubjects ?? [])
    .map((row: any) => row.subjects)
    .filter((subject: any) => subject && subject.school_id === schoolId)
    .map((subject: any) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      curriculum_area: subject.curriculum_area,
      is_compulsory: subject.is_compulsory,
    })) as SelectionSubject[]

  if (fromClass.length > 0) {
    return fromClass.sort((a, b) => a.name.localeCompare(b.name))
  }

  const { data: schoolSubjects, error: schoolSubjectsError } = await admin
    .from('subjects')
    .select('id, code, name, curriculum_area, is_compulsory')
    .eq('school_id', schoolId)
    .order('name', { ascending: true })
  if (schoolSubjectsError) throw schoolSubjectsError
  return (schoolSubjects ?? []) as SelectionSubject[]
}

async function getCompulsorySubjectIds(schoolId: string) {
  const { data, error } = await admin
    .from('subjects')
    .select('id, code')
    .eq('school_id', schoolId)
    .in('code', CORE_CODES)
  if (error) throw error
  return (data ?? []).map((row: any) => row.id as string)
}

export async function getSubjectSelectionSetup(params: {
  termId: string
  classId: string
}): Promise<SubjectSelectionSetupResult> {
  const auth = await requireSchoolAdminOrHeadTeacher()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const [students, subjects, compulsorySubjectIds, settingsRow] = await Promise.all([
      getClassStudents(params.termId, params.classId),
      getClassOfferedSubjects(params.classId, auth.user.school_id),
      getCompulsorySubjectIds(auth.user.school_id),
      admin
        .from('school_results_settings')
        .select('min_total_subjects, max_total_subjects, min_sciences, max_humanities, ranking_method, ranking_n')
        .eq('school_id', auth.user.school_id)
        .maybeSingle(),
    ])

    const studentIds = students.map((s) => s.id)
    let enrollments: EnrollmentRow[] = []
    if (studentIds.length > 0) {
      const { data, error } = await admin
        .from('student_subject_enrollments')
        .select('*')
        .eq('school_id', auth.user.school_id)
        .eq('term_id', params.termId)
        .in('student_id', studentIds)
        .eq('status', 'ACTIVE')
      if (error) throw error
      enrollments = (data ?? []) as EnrollmentRow[]
    }

    if (settingsRow.error) throw settingsRow.error

    return {
      success: true,
      students,
      subjects,
      compulsorySubjectIds,
      enrollments,
      rules: (settingsRow.data ?? null) as any,
    }
  } catch (error) {
    console.error('Get subject selection setup error:', error)
    return { success: false, error: toActionError(error) }
  }
}

async function saveSelectionsInternal(input: {
  schoolId: string
  termId: string
  classId: string
  selections: Array<{ studentId: string; subjectIds: string[] }>
  createdBy: string
}) {
  const students = await getClassStudents(input.termId, input.classId)
  const studentIds = new Set(students.map((s) => s.id))
  if (studentIds.size === 0) return { upserted: 0, dropped: 0, validations: [] as Array<{ studentId: string; count: number }> }

  const offered = await getClassOfferedSubjects(input.classId, input.schoolId)
  const offeredIds = new Set(offered.map((s) => s.id))
  const compulsoryIds = await getCompulsorySubjectIds(input.schoolId)
  const compulsorySet = new Set(compulsoryIds)

  const { data: existingRows, error: existingError } = await admin
    .from('student_subject_enrollments')
    .select('*')
    .eq('school_id', input.schoolId)
    .eq('term_id', input.termId)
    .in('student_id', Array.from(studentIds))
  if (existingError) throw existingError

  const existingByStudent = new Map<string, EnrollmentRow[]>()
  ;(existingRows ?? []).forEach((row: any) => {
    const list = existingByStudent.get(row.student_id) ?? []
    list.push(row as EnrollmentRow)
    existingByStudent.set(row.student_id, list)
  })

  const now = new Date().toISOString()
  const upserts: Array<Record<string, unknown>> = []
  const dropIds: string[] = []
  const validations: Array<{ studentId: string; count: number }> = []

  for (const selection of input.selections) {
    if (!studentIds.has(selection.studentId)) continue
    const normalized = Array.from(
      new Set(
        selection.subjectIds.filter((subjectId) => offeredIds.has(subjectId))
      )
    )
    const finalSubjectIds = Array.from(new Set([...normalized, ...compulsoryIds]))
    validations.push({ studentId: selection.studentId, count: finalSubjectIds.length })

    const existing = existingByStudent.get(selection.studentId) ?? []
    const activeExisting = existing.filter((row) => row.status === 'ACTIVE')

    for (const subjectId of finalSubjectIds) {
      upserts.push({
        school_id: input.schoolId,
        term_id: input.termId,
        student_id: selection.studentId,
        subject_id: subjectId,
        is_compulsory: compulsorySet.has(subjectId),
        status: 'ACTIVE',
        created_by: input.createdBy,
        enrolled_at: now,
        dropped_at: null,
        updated_at: now,
      })
    }

    for (const row of activeExisting) {
      if (!finalSubjectIds.includes(row.subject_id)) {
        dropIds.push(row.id)
      }
    }
  }

  if (upserts.length > 0) {
    const { error: upsertError } = await admin
      .from('student_subject_enrollments')
      .upsert(upserts, { onConflict: 'term_id,student_id,subject_id' })
    if (upsertError) throw upsertError
  }

  if (dropIds.length > 0) {
    const { error: dropError } = await admin
      .from('student_subject_enrollments')
      .update({ status: 'DROPPED', dropped_at: now, updated_at: now })
      .in('id', dropIds)
    if (dropError) throw dropError
  }

  return { upserted: upserts.length, dropped: dropIds.length, validations }
}

export async function saveClassSubjectSelections(input: {
  termId: string
  classId: string
  selections: Array<{ studentId: string; subjectIds: string[] }>
}): Promise<{ success: true; upserted: number; dropped: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.classId,
      selections: input.selections,
      createdBy: auth.user.id,
    })

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subject_selection:save_class',
      resource_type: 'student_subject_enrollments',
      resource_id: null,
      changes: {
        term_id: input.termId,
        class_id: input.classId,
        students: input.selections.length,
        upserted: saved.upserted,
        dropped: saved.dropped,
      },
    })

    return { success: true, upserted: saved.upserted, dropped: saved.dropped }
  } catch (error) {
    console.error('Save class subject selections error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function autoAssignCompulsorySubjects(input: {
  termId: string
  classId: string
}): Promise<{ success: true; upserted: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const students = await getClassStudents(input.termId, input.classId)
    const selections = students.map((student) => ({ studentId: student.id, subjectIds: [] }))
    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.classId,
      selections,
      createdBy: auth.user.id,
    })
    return { success: true, upserted: saved.upserted }
  } catch (error) {
    console.error('Auto assign compulsory subjects error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function bulkAssignSubjectToClass(input: {
  termId: string
  classId: string
  subjectId: string
}): Promise<{ success: true; upserted: number; dropped: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const setup = await getSubjectSelectionSetup({ termId: input.termId, classId: input.classId })
    if (!setup.success) return setup

    const currentByStudent = new Map<string, Set<string>>()
    for (const row of setup.enrollments) {
      const set = currentByStudent.get(row.student_id) ?? new Set<string>()
      set.add(row.subject_id)
      currentByStudent.set(row.student_id, set)
    }

    const selections = setup.students.map((student) => {
      const set = currentByStudent.get(student.id) ?? new Set<string>()
      set.add(input.subjectId)
      return { studentId: student.id, subjectIds: Array.from(set) }
    })

    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.classId,
      selections,
      createdBy: auth.user.id,
    })

    return { success: true, upserted: saved.upserted, dropped: saved.dropped }
  } catch (error) {
    console.error('Bulk assign subject to class error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function bulkRemoveSubjectFromClass(input: {
  termId: string
  classId: string
  subjectId: string
}): Promise<{ success: true; upserted: number; dropped: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const setup = await getSubjectSelectionSetup({ termId: input.termId, classId: input.classId })
    if (!setup.success) return setup

    if (setup.compulsorySubjectIds.includes(input.subjectId)) {
      return { success: false, error: { code: 'forbidden', message: 'Compulsory subjects cannot be removed.' } }
    }

    const currentByStudent = new Map<string, Set<string>>()
    for (const row of setup.enrollments) {
      const set = currentByStudent.get(row.student_id) ?? new Set<string>()
      set.add(row.subject_id)
      currentByStudent.set(row.student_id, set)
    }

    const selections = setup.students.map((student) => {
      const set = currentByStudent.get(student.id) ?? new Set<string>()
      set.delete(input.subjectId)
      return { studentId: student.id, subjectIds: Array.from(set) }
    })

    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.classId,
      selections,
      createdBy: auth.user.id,
    })

    return { success: true, upserted: saved.upserted, dropped: saved.dropped }
  } catch (error) {
    console.error('Bulk remove subject from class error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function copySubjectSelectionsFromClass(input: {
  termId: string
  sourceClassId: string
  targetClassId: string
}): Promise<{ success: true; copiedSubjects: number; upserted: number; dropped: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const [source, target] = await Promise.all([
      getSubjectSelectionSetup({ termId: input.termId, classId: input.sourceClassId }),
      getSubjectSelectionSetup({ termId: input.termId, classId: input.targetClassId }),
    ])
    if (!source.success) return source
    if (!target.success) return target

    const nonCompulsoryIds = new Set(
      source.subjects
        .filter((subject) => !source.compulsorySubjectIds.includes(subject.id))
        .map((subject) => subject.id)
    )

    const frequency = new Map<string, number>()
    source.enrollments.forEach((row) => {
      if (!nonCompulsoryIds.has(row.subject_id)) return
      frequency.set(row.subject_id, (frequency.get(row.subject_id) ?? 0) + 1)
    })

    const targetRules = target.rules
    const maxTotal = targetRules?.max_total_subjects ?? 9
    const compulsoryCount = target.compulsorySubjectIds.length
    const electiveSlots = Math.max(0, maxTotal - compulsoryCount)

    const chosenElectives = [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, electiveSlots)
      .map(([subjectId]) => subjectId)

    const selections = target.students.map((student) => ({
      studentId: student.id,
      subjectIds: chosenElectives,
    }))

    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.targetClassId,
      selections,
      createdBy: auth.user.id,
    })

    return { success: true, copiedSubjects: chosenElectives.length, upserted: saved.upserted, dropped: saved.dropped }
  } catch (error) {
    console.error('Copy subject selections error:', error)
    return { success: false, error: toActionError(error) }
  }
}

function parseSubjectCodes(token: string) {
  return token
    .split(/[|; ]+/g)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
}

export async function importSubjectSelectionsCsv(input: {
  termId: string
  classId: string
  csvText: string
}): Promise<{ success: true; rows: number; upserted: number; dropped: number } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const setup = await getSubjectSelectionSetup({ termId: input.termId, classId: input.classId })
    if (!setup.success) return setup

    const lines = input.csvText
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      return { success: false, error: { code: 'invalid_input', message: 'CSV text is empty.' } }
    }

    const subjectByCode = new Map(setup.subjects.map((subject) => [subject.code.toUpperCase(), subject.id]))
    const studentByAdmission = new Map(setup.students.map((student) => [student.admission_number.toUpperCase(), student.id]))

    const selections: Array<{ studentId: string; subjectIds: string[] }> = []
    let processedRows = 0

    for (const line of lines) {
      const cols = line.split(',').map((cell) => cell.trim())
      if (cols.length < 2) continue

      const admission = cols[0].toUpperCase()
      if (admission === 'ADM_NO' || admission === 'ADMISSION_NO' || admission === 'ADMISSION_NUMBER') {
        continue
      }

      const studentId = studentByAdmission.get(admission)
      if (!studentId) continue

      const rawCodes = cols.length > 2 ? cols.slice(1) : parseSubjectCodes(cols[1])
      const subjectIds = rawCodes
        .map((token) => token.trim().toUpperCase())
        .map((code) => subjectByCode.get(code))
        .filter(Boolean) as string[]

      selections.push({ studentId, subjectIds })
      processedRows += 1
    }

    if (selections.length === 0) {
      return { success: false, error: { code: 'invalid_input', message: 'No valid rows found in CSV.' } }
    }

    const saved = await saveSelectionsInternal({
      schoolId: auth.user.school_id,
      termId: input.termId,
      classId: input.classId,
      selections,
      createdBy: auth.user.id,
    })

    return { success: true, rows: processedRows, upserted: saved.upserted, dropped: saved.dropped }
  } catch (error) {
    console.error('Import subject selections CSV error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getSubjectSelectionValidation(input: {
  termId: string
  classId: string
}): Promise<
  | {
      success: true
      rows: Array<{
        student_id: string
        student_name: string
        admission_number: string
        total_subjects: number
        status: 'OK' | 'TOO_FEW' | 'TOO_MANY'
      }>
    }
  | { success: false; error: ActionError }
> {
  const auth = await requireSchoolAdminOrHeadTeacher()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const setup = await getSubjectSelectionSetup({ termId: input.termId, classId: input.classId })
    if (!setup.success) return setup

    const minSubjects = setup.rules?.min_total_subjects ?? 7
    const maxSubjects = setup.rules?.max_total_subjects ?? 9

    const byStudent = new Map<string, number>()
    setup.enrollments.forEach((row) => {
      byStudent.set(row.student_id, (byStudent.get(row.student_id) ?? 0) + 1)
    })

    const rows = setup.students.map((student) => {
      const total = byStudent.get(student.id) ?? 0
      const status: 'OK' | 'TOO_FEW' | 'TOO_MANY' =
        total < minSubjects ? 'TOO_FEW' : total > maxSubjects ? 'TOO_MANY' : 'OK'
      return {
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        admission_number: student.admission_number,
        total_subjects: total,
        status,
      }
    })

    return { success: true, rows }
  } catch (error) {
    console.error('Get subject selection validation error:', error)
    return { success: false, error: toActionError(error) }
  }
}
