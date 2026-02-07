'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type TimetableSlotRow = Database['public']['Tables']['timetable_slots']['Row']
type LessonSessionRow = Database['public']['Tables']['lesson_sessions']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type LessonGenerationResult =
  | { success: true; created: number; message: string }
  | { success: false; error: ActionError }

export type LessonsResult =
  | { success: true; lessons: any[] }
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

function toDateOnlyISO(value: Date) {
  return value.toISOString().split('T')[0]
}

// Generate lesson sessions from timetable slots for a date range
// Call this daily or weekly to create lesson_sessions for upcoming lessons
export async function generateLessonSessions(
  academicTermId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
): Promise<LessonGenerationResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error: termError } = await admin
      .from('academic_terms')
      .select('id, school_id')
      .eq('id', academicTermId)
      .single()

    if (termError) throw termError
    if (term.school_id !== auth.user.school_id) {
      return { success: false, error: { code: 'forbidden', message: 'Term does not belong to your school.' } }
    }

    const { data: slots, error: slotsError } = await admin
      .from('timetable_slots')
      .select('*')
      .eq('academic_term_id', academicTermId)

    if (slotsError) throw slotsError

    const slotRows = (slots ?? []) as TimetableSlotRow[]
    if (slotRows.length === 0) {
      return { success: true, created: 0, message: 'No timetable slots found for this term.' }
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { success: false, error: { code: 'invalid_input', message: 'Invalid start/end date.' } }
    }

    const lessonsToCreate: Partial<LessonSessionRow>[] = []

    for (const slot of slotRows) {
      let current = new Date(start)

      while (current <= end) {
        const dayOfWeek = current.getDay() // 0=Sun..6=Sat
        const dbDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek

        if (dbDayOfWeek === slot.day_of_week && dbDayOfWeek >= 1 && dbDayOfWeek <= 5) {
          const lessonDate = toDateOnlyISO(current)
          lessonsToCreate.push({
            academic_term_id: academicTermId,
            timetable_slot_id: slot.id,
            lesson_date: lessonDate,
            teacher_id: slot.teacher_id,
            class_id: slot.class_id,
            subject_id: slot.subject_id,
            session_status: 'OPEN',
            is_attended: false,
          })
        }

        current.setDate(current.getDate() + 1)
      }
    }

    if (lessonsToCreate.length === 0) {
      return { success: true, created: 0, message: 'No lessons to create for that date range.' }
    }

    const { data, error } = await admin
      .from('lesson_sessions')
      .upsert(lessonsToCreate, { onConflict: 'timetable_slot_id,lesson_date' })
      .select('id')

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'lesson_sessions:generate',
      resource_type: 'lesson_sessions',
      resource_id: null,
      changes: { academic_term_id: academicTermId, start_date: startDate, end_date: endDate, created: data?.length ?? 0 },
    })

    return {
      success: true,
      created: data?.length || 0,
      message: `Created ${data?.length || 0} lesson sessions`,
    }
  } catch (error) {
    console.error('Generate lessons error:', error)
    return { success: false, error: toActionError(error) }
  }
}

// Get unattended lessons for a teacher (lessons without all students marked)
export async function getUnattendedLessons(teacherId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lesson_sessions')
      .select(
        `
        id,
        lesson_date,
        is_attended,
        session_status,
        classes (name, grade_level),
        subjects (name, code)
      `
      )
      .eq('teacher_id', teacherId)
      .eq('is_attended', false)
      .neq('session_status', 'LOCKED')
      .gte('lesson_date', new Date().toISOString().split('T')[0])
      .order('lesson_date', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Get unattended lessons error:', error)
    return []
  }
}

// Mark lesson as attended
export async function markLessonAsAttended(lessonSessionId: string) {
  try {
    const auth = await requireSignedIn()
    if (!auth.ok) return { success: false, error: auth.error }

    const { data, error } = await admin
      .from('lesson_sessions')
      .update({ is_attended: true })
      .eq('id', lessonSessionId)
      .select()
      .single()

    if (error) throw error
    return { success: true, lessonSession: data }
  } catch (error) {
    console.error('Mark lesson attended error:', error)
    return { success: false, error: toActionError(error) }
  }
}
