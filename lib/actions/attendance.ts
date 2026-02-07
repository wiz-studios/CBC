'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type AttendanceRecord = {
  id: string
  lesson_session_id: string
  student_id: string
  status: 'PRESENT' | 'ABSENT'
  marked_by_teacher_id: string
  marked_at: string
  created_at: string
  updated_at: string
}

type ActionError = { code: string; message: string }

type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

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

async function getTeacherIdForUser(userId: string, schoolId: string) {
  const { data: teacher, error } = await admin
    .from('teachers')
    .select('id')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (error) throw error
  if (!teacher) throw new Error('Teacher profile not found for current user.')
  return teacher.id as string
}

// Mark attendance for a specific lesson session
// CRITICAL: Checks if lesson is locked before allowing changes
export async function markAttendance(
  lessonSessionId: string,
  studentId: string,
  status: 'PRESENT' | 'ABSENT'
): Promise<ActionResult<AttendanceRecord>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'TEACHER') {
      return { success: false, error: { code: 'forbidden', message: 'Teacher access required.' } }
    }

    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    // 1. Check if lesson is locked
    const { data: lesson, error: lessonError } = await admin
      .from('lesson_sessions')
      .select('id, teacher_id, locked_at, submitted_at, session_status')
      .eq('id', lessonSessionId)
      .single()

    if (lessonError) throw lessonError
    if (!lesson) throw new Error('Lesson session not found')

    if (lesson.teacher_id !== teacherId) {
      return { success: false, error: { code: 'forbidden', message: 'You can only mark your own lessons.' } }
    }

    // 2. Prevent changes if locked
    if (lesson.locked_at || lesson.session_status === 'LOCKED') {
      throw new Error('Lesson is locked. Contact HOD to unlock.')
    }

    // 3. Check if past submission cutoff (2 hours after submitted)
    if (lesson.submitted_at) {
      const submittedTime = new Date(lesson.submitted_at)
      const cutoffTime = new Date(submittedTime.getTime() + 2 * 60 * 60 * 1000)
      if (new Date() > cutoffTime) {
        throw new Error(
          'Editing window closed. Submit within 2 hours or contact HOD.'
        )
      }
    }

    // 4. Safe to insert/update
    const { data, error } = await admin
      .from('attendance')
      .upsert(
        {
          lesson_session_id: lessonSessionId,
          student_id: studentId,
          status,
          marked_by_teacher_id: teacherId,
          marked_at: new Date().toISOString(),
        },
        { onConflict: 'lesson_session_id,student_id' }
      )
      .select()
      .single()

    if (error) throw error
    return { success: true, data: data as AttendanceRecord }
  } catch (error) {
    console.error('Mark attendance error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function upsertLessonAttendanceBulk(
  lessonSessionId: string,
  records: Array<{ student_id: string; status: 'PRESENT' | 'ABSENT' }>
): Promise<ActionResult<{ updated: number }>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'TEACHER') {
      return { success: false, error: { code: 'forbidden', message: 'Teacher access required.' } }
    }

    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data: lesson, error: lessonError } = await admin
      .from('lesson_sessions')
      .select('id, teacher_id, locked_at, submitted_at, session_status')
      .eq('id', lessonSessionId)
      .single()

    if (lessonError) throw lessonError
    if (!lesson) throw new Error('Lesson session not found')

    if (lesson.teacher_id !== teacherId) {
      return { success: false, error: { code: 'forbidden', message: 'You can only mark your own lessons.' } }
    }

    if (lesson.locked_at || lesson.session_status === 'LOCKED') {
      return { success: false, error: { code: 'locked', message: 'Lesson is locked.' } }
    }

    if (lesson.submitted_at) {
      const submittedTime = new Date(lesson.submitted_at)
      const cutoffTime = new Date(submittedTime.getTime() + 2 * 60 * 60 * 1000)
      if (new Date() > cutoffTime) {
        return {
          success: false,
          error: { code: 'edit_window_closed', message: 'Editing window closed. Contact HOD to unlock.' },
        }
      }
    }

    const now = new Date().toISOString()
    const payload = records.map((r) => ({
      lesson_session_id: lessonSessionId,
      student_id: r.student_id,
      status: r.status,
      marked_by_teacher_id: teacherId,
      marked_at: now,
    }))

    const { error } = await admin
      .from('attendance')
      .upsert(payload, { onConflict: 'lesson_session_id,student_id' })

    if (error) throw error

    return { success: true, data: { updated: payload.length } }
  } catch (error) {
    console.error('Upsert lesson attendance bulk error:', error)
    return { success: false, error: toActionError(error) }
  }
}

// Get all attendance for a specific lesson session
export async function getLessonSessionAttendance(lessonSessionId: string) {
  try {
    const auth = await requireSignedIn()
    if (!auth.ok) return []

    if (auth.user.role === 'TEACHER') {
      const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
      const { data: lesson, error: lessonError } = await admin
        .from('lesson_sessions')
        .select('id, teacher_id')
        .eq('id', lessonSessionId)
        .single()

      if (lessonError) throw lessonError
      if (!lesson || (lesson as any).teacher_id !== teacherId) {
        return []
      }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('attendance')
      .select(
        `
        id,
        lesson_session_id,
        student_id,
        status,
        marked_at,
        marked_by_teacher_id,
        students (
          id,
          admission_number,
          first_name,
          last_name
        )
      `
      )
      .eq('lesson_session_id', lessonSessionId)
      .order('students(last_name)', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Get lesson attendance error:', error)
    return []
  }
}

// Get all lesson sessions for a teacher on a specific date
export async function getTeacherLessonsForDate(teacherId: string, lessonDate: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lesson_sessions')
      .select(
        `
        id,
        lesson_date,
        teacher_id,
        class_id,
        subject_id,
        is_attended,
        session_status,
        locked_at,
        timetable_slot_id,
        classes (name, grade_level),
        subjects (name, code)
      `
      )
      .eq('teacher_id', teacherId)
      .eq('lesson_date', lessonDate)
      .order('timetable_slot_id', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Get teacher lessons error:', error)
    return []
  }
}

export async function getMyLessonsForDate(lessonDate: string) {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error } as const

  try {
    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
    const lessons = await getTeacherLessonsForDate(teacherId, lessonDate)
    return { success: true, lessons } as const
  } catch (error) {
    console.error('Get my lessons error:', error)
    return { success: false, error: toActionError(error) } as const
  }
}

export async function submitLessonAttendance(lessonSessionId: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.role !== 'TEACHER') {
      return { success: false, error: { code: 'forbidden', message: 'Teacher access required.' } }
    }

    const teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data: lesson, error: lessonError } = await admin
      .from('lesson_sessions')
      .select('id, teacher_id, session_status, locked_at')
      .eq('id', lessonSessionId)
      .single()

    if (lessonError) throw lessonError
    if (!lesson) throw new Error('Lesson session not found')
    if (lesson.teacher_id !== teacherId) {
      return { success: false, error: { code: 'forbidden', message: 'You can only submit your own lessons.' } }
    }
    if (lesson.locked_at || lesson.session_status === 'LOCKED') {
      return { success: false, error: { code: 'locked', message: 'Lesson is locked.' } }
    }

    const { data, error } = await admin
      .from('lesson_sessions')
      .update({
        session_status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', lessonSessionId)
      .select('id')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'attendance:submit',
      resource_type: 'lesson_sessions',
      resource_id: lessonSessionId,
      changes: { lesson_session_id: lessonSessionId },
    })

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error('Submit lesson attendance error:', error)
    return { success: false, error: toActionError(error) }
  }
}

// Get attendance for a student during a term
export async function getStudentAttendanceForTerm(studentId: string, academicTermId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('attendance')
      .select(
        `
        id,
        status,
        lesson_sessions (
          lesson_date,
          academic_term_id,
          subject_id,
          subjects (name)
        )
      `
      )
      .eq('student_id', studentId)
      .eq('lesson_sessions.academic_term_id', academicTermId)
      .order('lesson_sessions(lesson_date)', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Get student attendance error:', error)
    return []
  }
}

// Calculate attendance statistics for a student
export async function getAttendanceStats(studentId: string, academicTermId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('attendance')
      .select('status, lesson_sessions(academic_term_id)')
      .eq('student_id', studentId)
      .eq('lesson_sessions.academic_term_id', academicTermId)

    if (error) throw error

    const rows = (data ?? []) as unknown as Array<{ status: 'PRESENT' | 'ABSENT' }>
    const stats = {
      total: rows.length,
      present: rows.filter((r) => r.status === 'PRESENT').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
    }

    return {
      ...stats,
      percentage: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
    }
  } catch (error) {
    console.error('Get attendance statistics error:', error)
    return { total: 0, present: 0, absent: 0, percentage: 0 }
  }
}

export async function lockLessonSession(
  lessonSessionId: string,
  reason: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const isAllowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER'
    if (!isAllowed) {
      return { success: false, error: { code: 'forbidden', message: 'Only admins can lock lessons.' } }
    }

    const lockerTeacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)

    const { data, error } = await admin
      .from('lesson_sessions')
      .update({
        session_status: 'LOCKED',
        locked_at: new Date().toISOString(),
        locked_by_teacher_id: lockerTeacherId,
        lock_reason: reason.trim() || null,
      })
      .eq('id', lessonSessionId)
      .select('id')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'attendance:lock',
      resource_type: 'lesson_sessions',
      resource_id: lessonSessionId,
      changes: { lesson_session_id: lessonSessionId, reason: reason.trim() || null },
    })

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error('Lock lesson session error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function unlockLessonSession(
  lessonSessionId: string,
  reason: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const isAllowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER'
    if (!isAllowed) {
      return { success: false, error: { code: 'forbidden', message: 'Only admins can unlock lessons.' } }
    }

    const { data, error } = await admin
      .from('lesson_sessions')
      .update({
        session_status: 'OPEN',
        locked_at: null,
        locked_by_teacher_id: null,
        lock_reason: null,
      })
      .eq('id', lessonSessionId)
      .select('id')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'attendance:unlock',
      resource_type: 'lesson_sessions',
      resource_id: lessonSessionId,
      changes: { lesson_session_id: lessonSessionId, reason: reason.trim() || null },
    })

    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error('Unlock lesson session error:', error)
    return { success: false, error: toActionError(error) }
  }
}
