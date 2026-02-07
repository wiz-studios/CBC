'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type ReportCardRow = Database['public']['Tables']['report_card_versions']['Row']
type StudentRow = Database['public']['Tables']['students']['Row']
type AssessmentRow = Database['public']['Tables']['assessments']['Row']
type AttendanceRow = Database['public']['Tables']['attendance']['Row']
type AssessmentTypeRow = Database['public']['Tables']['assessment_types']['Row']
type EnrollmentRow = Database['public']['Tables']['student_subject_enrollments']['Row']
type GradeBandRow = Database['public']['Tables']['grade_bands']['Row']
type ResultsSettingsRow = Database['public']['Tables']['school_results_settings']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type SubjectResultsProfileRow = Database['public']['Tables']['subject_results_profiles']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type ReportCardWithStudent = {
  report: ReportCardRow
  student: Pick<StudentRow, 'id' | 'admission_number' | 'first_name' | 'last_name'>
}

export type ReportCardsResult =
  | { success: true; reports: ReportCardWithStudent[] }
  | { success: false; error: ActionError }

export type ReportGenerationResult =
  | { success: true; created: number }
  | { success: false; error: ActionError }

export type ReportPublishResult =
  | { success: true; updated: number }
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

async function requireAdminOrHead(): Promise<AuthResult> {
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

async function getAllowedTeacherClassIds(teacherId: string, academicTermId?: string) {
  const supabase = await createClient()

  let query = supabase
    .from('timetable_slots')
    .select('class_id')
    .eq('teacher_id', teacherId)

  if (academicTermId) query = query.eq('academic_term_id', academicTermId)

  const { data, error } = await query
  if (error) throw error

  const classIds = Array.from(new Set((data ?? []).map((r: any) => r.class_id))).filter(Boolean)
  return classIds as string[]
}

type SubjectLine = {
  subject_id: string
  subject_code: string
  subject_name: string
  is_compulsory: boolean
  percentage: number
  grade: string | null
  points: number | null
  included_for_ranking: boolean
}

function findBandForScore(bands: GradeBandRow[], score: number) {
  return bands.find((band) => score >= Number(band.min_score) && score <= Number(band.max_score)) ?? null
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function bucketAssessmentType(name: string) {
  const value = String(name || '').toUpperCase()
  if (value.includes('CAT')) return 'CAT'
  if (value.includes('EXAM') || value.includes('END') || value.includes('TERM')) return 'EXAM'
  return 'OTHER'
}

export async function getReportCards(params: {
  academicTermId: string
  classId: string
  status?: 'DRAFT' | 'RELEASED'
}): Promise<ReportCardsResult> {
  const auth = await requireStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const allowedClassIds = await getAllowedTeacherClassIds(teacherId, params.academicTermId)
      if (!allowedClassIds.includes(params.classId)) {
        return { success: true, reports: [] }
      }
    }

    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, admission_number, first_name, last_name')
      .eq('class_id', params.classId)
      .eq('academic_term_id', params.academicTermId)

    if (studentsError) throw studentsError

    const studentRows = (students ?? []) as Array<Pick<StudentRow, 'id' | 'admission_number' | 'first_name' | 'last_name'>>
    if (studentRows.length === 0) return { success: true, reports: [] }

    let reportQuery = supabase
      .from('report_card_versions')
      .select('*')
      .eq('academic_term_id', params.academicTermId)
      .in('student_id', studentRows.map((s) => s.id))

    if (params.status) reportQuery = reportQuery.eq('status', params.status)

    const { data: reports, error: reportsError } = await reportQuery
      .order('generated_at', { ascending: false })

    if (reportsError) throw reportsError

    const studentById = new Map(studentRows.map((s) => [s.id, s]))
    const enriched = ((reports ?? []) as ReportCardRow[])
      .map((r) => ({ report: r, student: studentById.get(r.student_id)! }))
      .filter((r) => r.student)

    return { success: true, reports: enriched }
  } catch (error) {
    console.error('Get report cards error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function generateReportCardsForClass(params: {
  academicTermId: string
  classId: string
}): Promise<ReportGenerationResult> {
  const auth = await requireAdminOrHead()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data: settingsData, error: settingsError } = await admin
      .from('school_results_settings')
      .select('*')
      .eq('school_id', auth.user.school_id)
      .maybeSingle()
    if (settingsError) throw settingsError
    if (!settingsData) {
      return {
        success: false,
        error: {
          code: 'missing_results_settings',
          message: 'Results settings are not configured. Open Settings → Results and save defaults.',
        },
      }
    }

    const settings = settingsData as ResultsSettingsRow
    if (!settings.grade_scale_id) {
      return { success: false, error: { code: 'missing_grade_scale', message: 'No grade scale configured.' } }
    }

    const { data: bandsData, error: bandsError } = await admin
      .from('grade_bands')
      .select('*')
      .eq('grade_scale_id', settings.grade_scale_id)
      .order('sort_order', { ascending: true })
    if (bandsError) throw bandsError
    const gradeBands = (bandsData ?? []) as GradeBandRow[]
    if (gradeBands.length === 0) {
      return { success: false, error: { code: 'missing_grade_bands', message: 'No grade bands configured.' } }
    }

    const { data: students, error: studentsError } = await admin
      .from('students')
      .select('id, admission_number, first_name, last_name')
      .eq('class_id', params.classId)
      .eq('academic_term_id', params.academicTermId)
      .order('admission_number', { ascending: true })
    if (studentsError) throw studentsError

    const studentRows = (students ?? []) as StudentRow[]
    if (studentRows.length === 0) {
      return { success: false, error: { code: 'no_students', message: 'No students found for this class and term.' } }
    }

    const studentIds = studentRows.map((student) => student.id)

    const { data: enrollmentsData, error: enrollmentsError } = await admin
      .from('student_subject_enrollments')
      .select('*')
      .eq('school_id', auth.user.school_id)
      .eq('term_id', params.academicTermId)
      .eq('status', 'ACTIVE')
      .in('student_id', studentIds)
    if (enrollmentsError) throw enrollmentsError

    const enrollments = (enrollmentsData ?? []) as EnrollmentRow[]
    if (enrollments.length === 0) {
      return {
        success: false,
        error: {
          code: 'no_subject_enrollments',
          message: 'No subject selections found. Assign student subject selections first.',
        },
      }
    }

    const enrolledSubjectIds = Array.from(new Set(enrollments.map((row) => row.subject_id)))

    const [
      { data: subjectsData, error: subjectsError },
      { data: assessmentTypesData, error: typesError },
      { data: subjectProfilesData, error: subjectProfilesError },
    ] = await Promise.all([
      admin
        .from('subjects')
        .select('id, code, name, is_compulsory')
        .eq('school_id', auth.user.school_id)
        .in('id', enrolledSubjectIds),
      admin
        .from('assessment_types')
        .select('*')
        .eq('school_id', auth.user.school_id)
        .eq('is_active', true),
      admin
        .from('subject_results_profiles')
        .select('*')
        .eq('school_id', auth.user.school_id)
        .in('subject_id', enrolledSubjectIds),
    ])
    if (subjectsError) throw subjectsError
    if (typesError) throw typesError
    if (subjectProfilesError) throw subjectProfilesError

    const subjectsById = new Map((subjectsData ?? []).map((subject: any) => [subject.id, subject as SubjectRow]))
    const assessmentTypes = (assessmentTypesData ?? []) as AssessmentTypeRow[]
    const subjectProfiles = new Map<string, SubjectResultsProfileRow>(
      ((subjectProfilesData ?? []) as SubjectResultsProfileRow[]).map((row) => [row.subject_id, row])
    )
    const typeWeights = new Map<string, number>()
    const typeNames = new Map<string, string>()
    for (const type of assessmentTypes) {
      typeWeights.set(type.id, Number(type.weight ?? 0))
      typeNames.set(type.id, String(type.name || ''))
    }

    const { data: assessmentsData, error: assessmentsError } = await admin
      .from('assessments')
      .select('id, subject_id, assessment_type_id, max_score')
      .eq('class_id', params.classId)
      .eq('academic_term_id', params.academicTermId)
      .in('subject_id', enrolledSubjectIds)
    if (assessmentsError) throw assessmentsError

    const assessments = (assessmentsData ?? []) as Array<
      Pick<AssessmentRow, 'id' | 'subject_id' | 'assessment_type_id' | 'max_score'>
    >
    const assessmentIds = assessments.map((assessment) => assessment.id)

    let marks: Array<{ assessment_id: string; student_id: string; score: number }> = []
    if (assessmentIds.length > 0) {
      const { data: marksData, error: marksError } = await admin
        .from('student_marks')
        .select('assessment_id, student_id, score')
        .in('assessment_id', assessmentIds)
        .in('student_id', studentIds)
      if (marksError) throw marksError
      marks = (marksData ?? []) as any
    }

    const marksByAssessmentStudent = new Map<string, number>()
    for (const row of marks) {
      marksByAssessmentStudent.set(`${row.assessment_id}:${row.student_id}`, Number(row.score ?? 0))
    }

    const assessmentBySubject = new Map<string, typeof assessments>()
    for (const assessment of assessments) {
      const list = assessmentBySubject.get(assessment.subject_id) ?? []
      list.push(assessment)
      assessmentBySubject.set(assessment.subject_id, list)
    }

    const { data: existingReports, error: existingError } = await admin
      .from('report_card_versions')
      .select('student_id, version_number')
      .eq('academic_term_id', params.academicTermId)
      .in('student_id', studentIds)
    if (existingError) throw existingError

    const latestVersionByStudent = new Map<string, number>()
    ;(existingReports ?? []).forEach((row: any) => {
      const current = latestVersionByStudent.get(row.student_id) ?? 0
      if (row.version_number > current) latestVersionByStudent.set(row.student_id, row.version_number)
    })

    const { data: lessonSessions, error: sessionsError } = await admin
      .from('lesson_sessions')
      .select('id')
      .eq('academic_term_id', params.academicTermId)
      .eq('class_id', params.classId)
    if (sessionsError) throw sessionsError

    let attendanceRows: AttendanceRow[] = []
    const sessionIds = (lessonSessions ?? []).map((session: any) => session.id)
    if (sessionIds.length > 0) {
      const { data: attendanceData, error: attendanceError } = await admin
        .from('attendance')
        .select('student_id, status')
        .in('lesson_session_id', sessionIds)
        .in('student_id', studentIds)
      if (attendanceError) throw attendanceError
      attendanceRows = (attendanceData ?? []) as AttendanceRow[]
    }

    const attendanceByStudent = new Map<string, { present: number; absent: number }>()
    attendanceRows.forEach((row) => {
      const current = attendanceByStudent.get(row.student_id) ?? { present: 0, absent: 0 }
      if (row.status === 'PRESENT') current.present += 1
      else current.absent += 1
      attendanceByStudent.set(row.student_id, current)
    })

    const excludedCodes = new Set((settings.excluded_subject_codes ?? []).map((code) => code.toUpperCase()))
    const enrollmentsByStudent = new Map<string, EnrollmentRow[]>()
    for (const row of enrollments) {
      const list = enrollmentsByStudent.get(row.student_id) ?? []
      list.push(row)
      enrollmentsByStudent.set(row.student_id, list)
    }

    const subjectScoresForPosition = new Map<string, Array<{ student_id: string; percentage: number }>>()

    const summaryRows = studentRows.map((student) => {
      const studentEnrollments = enrollmentsByStudent.get(student.id) ?? []
      const subjectLines: SubjectLine[] = studentEnrollments
        .map((enrollment) => {
          const subject = subjectsById.get(enrollment.subject_id)
          if (!subject) return null

          const subjectAssessments = assessmentBySubject.get(enrollment.subject_id) ?? []
          const subjectProfile = subjectProfiles.get(subject.id)
          const assessmentsByType = new Map<string, typeof subjectAssessments>()
          for (const assessment of subjectAssessments) {
            const list = assessmentsByType.get(assessment.assessment_type_id) ?? []
            list.push(assessment)
            assessmentsByType.set(assessment.assessment_type_id, list)
          }

          let percentage = 0
          const types = Array.from(assessmentsByType.entries())
          if (types.length > 0) {
            const catScores: number[] = []
            const examScores: number[] = []
            const fallbackScores: number[] = []

            for (const assessment of subjectAssessments) {
              const score = marksByAssessmentStudent.get(`${assessment.id}:${student.id}`) ?? 0
              const maxScore = Number(assessment.max_score ?? 100)
              const percentageScore = maxScore > 0 ? (score / maxScore) * 100 : 0
              const bucket = bucketAssessmentType(typeNames.get(assessment.assessment_type_id) ?? '')
              if (bucket === 'CAT') catScores.push(percentageScore)
              else if (bucket === 'EXAM') examScores.push(percentageScore)
              else fallbackScores.push(percentageScore)
            }

            const useCatExam = catScores.length > 0 && examScores.length > 0
            if (useCatExam) {
              const catWeight = Number(subjectProfile?.cat_weight ?? settings.cat_weight)
              const examWeight = Number(subjectProfile?.exam_weight ?? settings.exam_weight)
              percentage = average(catScores) * (catWeight / 100) + average(examScores) * (examWeight / 100)
              if (fallbackScores.length > 0) {
                percentage = average([percentage, ...fallbackScores])
              }
            } else {
              const totalWeight = types.reduce((sum, [typeId]) => sum + (typeWeights.get(typeId) ?? 0), 0)
              if (totalWeight > 0) {
                percentage = types.reduce((sum, [typeId, typeAssessments]) => {
                  const typeWeight = typeWeights.get(typeId) ?? 0
                  const assessmentPercentages = typeAssessments.map((assessment) => {
                    const score = marksByAssessmentStudent.get(`${assessment.id}:${student.id}`) ?? 0
                    const maxScore = Number(assessment.max_score ?? 100)
                    return maxScore > 0 ? (score / maxScore) * 100 : 0
                  })
                  const typeAverage = average(assessmentPercentages)
                  return sum + typeAverage * (typeWeight / 100)
                }, 0)
              } else {
                const percentages = subjectAssessments.map((assessment) => {
                  const score = marksByAssessmentStudent.get(`${assessment.id}:${student.id}`) ?? 0
                  const maxScore = Number(assessment.max_score ?? 100)
                  return maxScore > 0 ? (score / maxScore) * 100 : 0
                })
                percentage = average(percentages)
              }
            }
          }

          const normalizedPercentage = Number(percentage.toFixed(2))
          const band = findBandForScore(gradeBands, normalizedPercentage)
          const includedForRanking =
            subjectProfile != null
              ? !subjectProfile.excluded_from_ranking
              : !excludedCodes.has(String(subject.code || '').toUpperCase())

          const forPosition = subjectScoresForPosition.get(subject.id) ?? []
          forPosition.push({ student_id: student.id, percentage: normalizedPercentage })
          subjectScoresForPosition.set(subject.id, forPosition)

          return {
            subject_id: subject.id,
            subject_code: subject.code,
            subject_name: subject.name,
            is_compulsory: enrollment.is_compulsory,
            percentage: normalizedPercentage,
            grade: band?.letter_grade ?? null,
            points: band?.points ?? null,
            included_for_ranking: includedForRanking,
          } satisfies SubjectLine
        })
        .filter(Boolean) as SubjectLine[]

      const rankedLines =
        settings.ranking_method === 'BEST_N'
          ? [...subjectLines.filter((line) => line.included_for_ranking)]
              .sort((a, b) => b.percentage - a.percentage)
              .slice(0, settings.ranking_n)
          : subjectLines.filter((line) => line.included_for_ranking)

      const totalMarks = Number(rankedLines.reduce((sum, line) => sum + line.percentage, 0).toFixed(2))
      const averagePercentage = rankedLines.length > 0 ? Number((totalMarks / rankedLines.length).toFixed(2)) : 0
      const meanPoints =
        rankedLines.length > 0
          ? Number(average(rankedLines.map((line) => Number(line.points ?? 0))).toFixed(3))
          : 0
      const overallBand = findBandForScore(gradeBands, averagePercentage)

      const attendance = attendanceByStudent.get(student.id)
      const daysPresent = attendance?.present ?? 0
      const daysAbsent = attendance?.absent ?? 0
      const attendanceTotal = daysPresent + daysAbsent
      const attendancePercentage = attendanceTotal > 0 ? Number(((daysPresent / attendanceTotal) * 100).toFixed(2)) : null

      return {
        student,
        subjectLines,
        rankedLines,
        totalMarks,
        averagePercentage,
        meanPoints,
        overallGrade: overallBand?.letter_grade ?? null,
        daysPresent,
        daysAbsent,
        attendancePercentage,
      }
    })

    const sortedForRank = [...summaryRows].sort((a, b) => b.averagePercentage - a.averagePercentage)
    const positionByStudent = new Map<string, number>()
    sortedForRank.forEach((row, index) => {
      positionByStudent.set(row.student.id, index + 1)
    })

    const subjectPositionByKey = new Map<string, number>()
    for (const [subjectId, rows] of subjectScoresForPosition.entries()) {
      const sorted = [...rows].sort((a, b) => b.percentage - a.percentage)
      sorted.forEach((row, index) => {
        subjectPositionByKey.set(`${subjectId}:${row.student_id}`, index + 1)
      })
    }

    const now = new Date().toISOString()
    const classSize = studentRows.length

    const payload = summaryRows.map((row) => ({
      student_id: row.student.id,
      academic_term_id: params.academicTermId,
      version_number: (latestVersionByStudent.get(row.student.id) ?? 0) + 1,
      generated_at: now,
      generated_by_teacher_id: teacherId,
      status: 'DRAFT',
      days_present: row.daysPresent,
      days_absent: row.daysAbsent,
      attendance_percentage: row.attendancePercentage,
      marks_snapshot: {
        ranking_method: settings.ranking_method,
        ranking_n: settings.ranking_n,
        excluded_subject_codes: Array.from(excludedCodes),
        subjects: row.subjectLines,
      },
      total_marks: row.totalMarks,
      average_percentage: row.averagePercentage,
      mean_points: row.meanPoints,
      overall_grade: row.overallGrade,
      ranking_method: settings.ranking_method,
      ranking_subject_count: row.rankedLines.length,
      position_in_class: positionByStudent.get(row.student.id) ?? null,
      position_in_stream: positionByStudent.get(row.student.id) ?? null,
      class_size: classSize,
      stream_size: classSize,
    }))

    const { data: insertedReports, error: insertError } = await admin
      .from('report_card_versions')
      .insert(payload)
      .select('id, student_id')
    if (insertError) throw insertError

    const reportIdByStudent = new Map((insertedReports ?? []).map((row: any) => [row.student_id as string, row.id as string]))

    const subjectLinesPayload: Array<Record<string, unknown>> = []
    for (const row of summaryRows) {
      const reportId = reportIdByStudent.get(row.student.id)
      if (!reportId) continue

      for (const line of row.subjectLines) {
        subjectLinesPayload.push({
          report_card_version_id: reportId,
          subject_id: line.subject_id,
          marks_obtained: line.percentage,
          max_marks: 100,
          percentage: line.percentage,
          grade: line.grade,
          points: line.points,
          position_in_subject: subjectPositionByKey.get(`${line.subject_id}:${row.student.id}`) ?? null,
          subject_teacher_comments: null,
        })
      }
    }

    if (subjectLinesPayload.length > 0) {
      const { error: insertLinesError } = await admin
        .from('report_card_version_subjects')
        .insert(subjectLinesPayload)
      if (insertLinesError) throw insertLinesError
    }

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'reports:generate',
      resource_type: 'report_card_versions',
      resource_id: null,
      changes: {
        academic_term_id: params.academicTermId,
        class_id: params.classId,
        count: payload.length,
        ranking_method: settings.ranking_method,
        ranking_n: settings.ranking_n,
      },
    })

    return { success: true, created: payload.length }
  } catch (error) {
    console.error('Generate report cards error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function publishReportCard(reportId: string): Promise<ReportPublishResult> {
  const auth = await requireAdminOrHead()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data, error } = await admin
      .from('report_card_versions')
      .update({
        status: 'RELEASED',
        released_at: new Date().toISOString(),
        released_by_teacher_id: teacherId,
      })
      .eq('id', reportId)
      .select('id')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'reports:release',
      resource_type: 'report_card_versions',
      resource_id: reportId,
      changes: { id: reportId },
    })

    return { success: true, updated: data ? 1 : 0 }
  } catch (error) {
    console.error('Publish report card error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function publishReportCardsBulk(params: {
  academicTermId: string
  classId: string
}): Promise<ReportPublishResult> {
  const auth = await requireAdminOrHead()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data: students, error: studentsError } = await admin
      .from('students')
      .select('id')
      .eq('class_id', params.classId)
      .eq('academic_term_id', params.academicTermId)

    if (studentsError) throw studentsError

    const studentIds = (students ?? []).map((s: any) => s.id)
    if (studentIds.length === 0) return { success: true, updated: 0 }

    const { data, error } = await admin
      .from('report_card_versions')
      .update({
        status: 'RELEASED',
        released_at: new Date().toISOString(),
        released_by_teacher_id: teacherId,
      })
      .eq('academic_term_id', params.academicTermId)
      .in('student_id', studentIds)
      .eq('status', 'DRAFT')
      .select('id')

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'reports:release_bulk',
      resource_type: 'report_card_versions',
      resource_id: null,
      changes: { academic_term_id: params.academicTermId, class_id: params.classId, count: data?.length ?? 0 },
    })

    return { success: true, updated: data?.length ?? 0 }
  } catch (error) {
    console.error('Publish report cards bulk error:', error)
    return { success: false, error: toActionError(error) }
  }
}
