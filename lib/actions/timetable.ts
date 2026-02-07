'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type TimetableSlotRow = Database['public']['Tables']['timetable_slots']['Row']
type TeacherRow = Database['public']['Tables']['teachers']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type AcademicTermRow = Database['public']['Tables']['academic_terms']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type TimetableSlotWithRefs = TimetableSlotRow & {
  classes?: Pick<ClassRow, 'id' | 'name' | 'grade_level' | 'stream'> | null
  subjects?: Pick<SubjectRow, 'id' | 'name' | 'code'> | null
  teachers?: (Pick<TeacherRow, 'id' | 'user_id'> & {
    users?: { first_name: string; last_name: string; email: string } | null
  }) | null
  academic_terms?: Pick<AcademicTermRow, 'id' | 'year' | 'term' | 'is_current'> | null
}

export type TimetableResult =
  | { success: true; slots: TimetableSlotWithRefs[] }
  | { success: false; error: ActionError }

export type TimetableSlotResult =
  | { success: true; slot: TimetableSlotRow }
  | { success: false; error: ActionError }

export type SeniorTimetableResult =
  | {
      success: true
      created: number
      skipped: number
      skipped_missing_teacher: number
      skipped_conflict: number
      skipped_workload_cap: number
      message: string
    }
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

const CORE_SUBJECT_CODES = ['ENG', 'KIS', 'MATH', 'CSL']
type DayTemplate = 'continuous' | 'kenya_fixed'
type TimeSlotRange = { start_time: string; end_time: string }

const KENYA_FIXED_BLOCKS: Array<{ start: string; end: string; label: string }> = [
  { start: '07:30', end: '10:30', label: 'Morning classes' },
  { start: '11:00', end: '13:00', label: 'Midday classes' },
  { start: '14:00', end: '16:00', label: 'Afternoon classes' },
]

function parseTimeToMinutes(value: string) {
  const [h, m] = value.split(':').map((v) => Number(v))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function minutesToTime(value: number) {
  const h = Math.floor(value / 60)
  const m = value % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildContinuousTimeSlots(startTime: string, periodsPerDay: number, periodMinutes: number) {
  if (periodsPerDay < 1 || periodsPerDay > 12) {
    return { ok: false as const, error: { code: 'invalid_input', message: 'Periods per day must be between 1 and 12.' } }
  }

  const startMinutes = parseTimeToMinutes(startTime)
  if (startMinutes === null) {
    return { ok: false as const, error: { code: 'invalid_input', message: 'Invalid start time.' } }
  }

  const totalEnd = startMinutes + periodsPerDay * periodMinutes
  if (totalEnd >= 24 * 60) {
    return { ok: false as const, error: { code: 'invalid_input', message: 'Period times exceed end of day.' } }
  }

  const timeSlots: TimeSlotRange[] = Array.from({ length: periodsPerDay }).map((_, idx) => {
    const start = startMinutes + idx * periodMinutes
    const end = start + periodMinutes
    return { start_time: minutesToTime(start), end_time: minutesToTime(end) }
  })

  return { ok: true as const, timeSlots }
}

function buildKenyaFixedTimeSlots(periodMinutes: number) {
  const timeSlots: TimeSlotRange[] = []

  for (const block of KENYA_FIXED_BLOCKS) {
    const blockStart = parseTimeToMinutes(block.start)
    const blockEnd = parseTimeToMinutes(block.end)
    if (blockStart === null || blockEnd === null || blockEnd <= blockStart) {
      return {
        ok: false as const,
        error: { code: 'invalid_template', message: `Invalid fixed block: ${block.label}.` },
      }
    }

    let cursor = blockStart
    while (cursor + periodMinutes <= blockEnd) {
      const start = cursor
      const end = cursor + periodMinutes
      timeSlots.push({ start_time: minutesToTime(start), end_time: minutesToTime(end) })
      cursor += periodMinutes
    }
  }

  if (timeSlots.length === 0) {
    return {
      ok: false as const,
      error: {
        code: 'invalid_input',
        message: 'No teaching periods fit the fixed school-day template. Reduce period length.',
      },
    }
  }
  if (timeSlots.length > 12) {
    return {
      ok: false as const,
      error: {
        code: 'invalid_input',
        message: 'Fixed school-day template supports up to 12 periods. Increase period length.',
      },
    }
  }

  return { ok: true as const, timeSlots }
}

export async function generateSeniorSchoolTimetable(input: {
  academic_term_id: string
  start_time: string
  period_minutes: number
  periods_per_day: number
  day_template?: DayTemplate
  max_periods_per_teacher_week?: number
  subject_scope: 'core' | 'assigned' | 'full'
  elective_subject_ids?: string[]
  fallback_teacher_by_subject?: Record<string, string>
}): Promise<SeniorTimetableResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error: termError } = await admin
      .from('academic_terms')
      .select('id, school_id')
      .eq('id', input.academic_term_id)
      .single()

    if (termError) throw termError
    if (term.school_id !== auth.user.school_id) {
      return { success: false, error: { code: 'forbidden', message: 'Term does not belong to your school.' } }
    }

    if (input.period_minutes < 20 || input.period_minutes > 120) {
      return { success: false, error: { code: 'invalid_input', message: 'Period length must be between 20 and 120 minutes.' } }
    }
    const maxPeriodsPerTeacherWeek = input.max_periods_per_teacher_week ?? 28
    if (maxPeriodsPerTeacherWeek < 1 || maxPeriodsPerTeacherWeek > 60) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'Max periods per teacher/week must be between 1 and 60.' },
      }
    }

    const dayTemplate: DayTemplate = input.day_template ?? 'continuous'
    const timeSlotBuild =
      dayTemplate === 'kenya_fixed'
        ? buildKenyaFixedTimeSlots(input.period_minutes)
        : buildContinuousTimeSlots(input.start_time, input.periods_per_day, input.period_minutes)
    if (!timeSlotBuild.ok) {
      return { success: false, error: timeSlotBuild.error }
    }
    const timeSlots = timeSlotBuild.timeSlots

    const { data: classes, error: classError } = await admin
      .from('classes')
      .select('id, grade_level')
      .eq('school_id', auth.user.school_id)
      .in('grade_level', [10, 11, 12])
      .eq('is_active', true)

    if (classError) throw classError
    if (!classes || classes.length === 0) {
      return { success: false, error: { code: 'no_classes', message: 'No active Grade 10-12 classes found.' } }
    }

    const classIds = classes.map((c) => c.id)

    let subjectIdsByClass: Record<string, string[]> = {}
    if (input.subject_scope === 'core' || input.subject_scope === 'full') {
      const { data: coreSubjects, error: coreError } = await admin
        .from('subjects')
        .select('id, code')
        .eq('school_id', auth.user.school_id)
        .in('code', CORE_SUBJECT_CODES)

      if (coreError) throw coreError

      const foundCodes = new Set((coreSubjects ?? []).map((s) => s.code))
      const missingCodes = CORE_SUBJECT_CODES.filter((c) => !foundCodes.has(c))
      if (missingCodes.length > 0) {
        return {
          success: false,
          error: { code: 'missing_subjects', message: `Missing core subjects: ${missingCodes.join(', ')}` },
        }
      }

      const coreIds = (coreSubjects ?? []).map((s) => s.id)
      let combined = coreIds

      if (input.subject_scope === 'full') {
        const electives = input.elective_subject_ids ?? []
        if (electives.length !== 3) {
          return {
            success: false,
            error: { code: 'invalid_input', message: 'Select exactly 3 elective subjects.' },
          }
        }
        combined = [...coreIds, ...electives]

        const assignments = classIds.flatMap((classId) => combined.map((subjectId) => ({ class_id: classId, subject_id: subjectId })))
        if (assignments.length > 0) {
          const { error: assignError } = await admin
            .from('class_subjects')
            .upsert(assignments, { onConflict: 'class_id,subject_id' })
          if (assignError) throw assignError
        }
      }

      subjectIdsByClass = Object.fromEntries(classIds.map((id) => [id, combined]))
    } else {
      const { data: classSubjects, error: subjectError } = await admin
        .from('class_subjects')
        .select('class_id, subject_id')
        .in('class_id', classIds)

      if (subjectError) throw subjectError

      subjectIdsByClass = (classSubjects ?? []).reduce<Record<string, string[]>>((acc, row) => {
        acc[row.class_id] ??= []
        acc[row.class_id].push(row.subject_id)
        return acc
      }, {})
    }

    const { data: assignments, error: assignmentError } = await admin
      .from('teacher_class_assignments')
      .select('teacher_id, class_id, subject_id')
      .in('class_id', classIds)
      .eq('academic_term_id', input.academic_term_id)

    if (assignmentError) throw assignmentError

    const assignmentMap = new Map<string, string>()
    for (const row of assignments ?? []) {
      const key = `${row.class_id}:${row.subject_id}`
      if (!assignmentMap.has(key)) assignmentMap.set(key, row.teacher_id)
    }

    const fallback = input.fallback_teacher_by_subject ?? {}

    const teacherSchedule = new Map<string, Set<string>>()
    const teacherLoad = new Map<string, number>()
    const classSchedule = new Map<string, Set<string>>()
    const slotsToCreate: Partial<TimetableSlotRow>[] = []

    let skippedMissingTeacher = 0
    let skippedConflict = 0
    let skippedWorkloadCap = 0

    for (const classId of classIds) {
      const subjects = subjectIdsByClass[classId] ?? []
      if (subjects.length === 0) continue

      for (let day = 1; day <= 5; day++) {
        for (let periodIndex = 0; periodIndex < timeSlots.length; periodIndex++) {
          const subjectId = subjects[((day - 1) * timeSlots.length + periodIndex) % subjects.length]
          const teacherId = assignmentMap.get(`${classId}:${subjectId}`) || fallback[subjectId]

          if (!teacherId) {
            skippedMissingTeacher += 1
            continue
          }

          const currentLoad = teacherLoad.get(teacherId) ?? 0
          if (currentLoad >= maxPeriodsPerTeacherWeek) {
            skippedWorkloadCap += 1
            continue
          }

          const slotKey = `${day}:${timeSlots[periodIndex].start_time}`
          const tSchedule = teacherSchedule.get(teacherId) ?? new Set<string>()
          const cSchedule = classSchedule.get(classId) ?? new Set<string>()

          if (tSchedule.has(slotKey) || cSchedule.has(slotKey)) {
            skippedConflict += 1
            continue
          }

          tSchedule.add(slotKey)
          cSchedule.add(slotKey)
          teacherSchedule.set(teacherId, tSchedule)
          teacherLoad.set(teacherId, currentLoad + 1)
          classSchedule.set(classId, cSchedule)

          slotsToCreate.push({
            academic_term_id: input.academic_term_id,
            teacher_id: teacherId,
            class_id: classId,
            subject_id: subjectId,
            day_of_week: day,
            start_time: timeSlots[periodIndex].start_time,
            end_time: timeSlots[periodIndex].end_time,
            room: null,
          })
        }
      }
    }

    if (slotsToCreate.length === 0) {
      return {
        success: true,
        created: 0,
        skipped: skippedMissingTeacher + skippedConflict + skippedWorkloadCap,
        skipped_missing_teacher: skippedMissingTeacher,
        skipped_conflict: skippedConflict,
        skipped_workload_cap: skippedWorkloadCap,
        message: 'No slots created. Check teacher assignments or subject setup.',
      }
    }

    const { data: created, error: insertError } = await admin
      .from('timetable_slots')
      .upsert(slotsToCreate, {
        onConflict: 'academic_term_id,teacher_id,class_id,subject_id,day_of_week,start_time',
      })
      .select('id')

    if (insertError) throw insertError

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'timetable:generate_senior',
      resource_type: 'timetable_slots',
      resource_id: null,
      changes: {
        academic_term_id: input.academic_term_id,
        created: created?.length ?? 0,
        skipped_missing_teacher: skippedMissingTeacher,
        skipped_conflict: skippedConflict,
        skipped_workload_cap: skippedWorkloadCap,
        subject_scope: input.subject_scope,
        day_template: dayTemplate,
        period_minutes: input.period_minutes,
        periods_generated_per_day: timeSlots.length,
        max_periods_per_teacher_week: maxPeriodsPerTeacherWeek,
      },
    })

    return {
      success: true,
      created: created?.length ?? 0,
      skipped: skippedMissingTeacher + skippedConflict + skippedWorkloadCap,
      skipped_missing_teacher: skippedMissingTeacher,
      skipped_conflict: skippedConflict,
      skipped_workload_cap: skippedWorkloadCap,
      message: 'Starter timetable generated.',
    }
  } catch (error) {
    console.error('Generate senior timetable error:', error)
    return { success: false, error: toActionError(error) }
  }
}

async function checkTimeConflict(input: {
  academicTermId: string
  teacherId: string
  classId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  excludeSlotId?: string
}) {
  const { academicTermId, teacherId, classId, dayOfWeek, startTime, endTime, excludeSlotId } = input

  const { data: teacherSlots, error: teacherError } = await admin
    .from('timetable_slots')
    .select('id, start_time, end_time')
    .eq('academic_term_id', academicTermId)
    .eq('teacher_id', teacherId)
    .eq('day_of_week', dayOfWeek)

  if (teacherError) throw teacherError

  const hasTeacherConflict = (teacherSlots ?? []).some((slot: any) => {
    if (excludeSlotId && slot.id === excludeSlotId) return false
    return startTime < slot.end_time && endTime > slot.start_time
  })

  const { data: classSlots, error: classError } = await admin
    .from('timetable_slots')
    .select('id, start_time, end_time')
    .eq('academic_term_id', academicTermId)
    .eq('class_id', classId)
    .eq('day_of_week', dayOfWeek)

  if (classError) throw classError

  const hasClassConflict = (classSlots ?? []).some((slot: any) => {
    if (excludeSlotId && slot.id === excludeSlotId) return false
    return startTime < slot.end_time && endTime > slot.start_time
  })

  return { hasTeacherConflict, hasClassConflict }
}

export async function createTimetableSlot(input: {
  academic_term_id: string
  teacher_id: string
  class_id: string
  subject_id: string
  day_of_week: number
  start_time: string
  end_time: string
  room?: string | null
}): Promise<TimetableSlotResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error: termError } = await admin
      .from('academic_terms')
      .select('id, school_id')
      .eq('id', input.academic_term_id)
      .single()

    if (termError) throw termError
    if (term.school_id !== auth.user.school_id) {
      return { success: false, error: { code: 'forbidden', message: 'Term does not belong to your school.' } }
    }

    const conflict = await checkTimeConflict({
      academicTermId: input.academic_term_id,
      teacherId: input.teacher_id,
      classId: input.class_id,
      dayOfWeek: input.day_of_week,
      startTime: input.start_time,
      endTime: input.end_time,
    })

    if (conflict.hasTeacherConflict) {
      return { success: false, error: { code: 'teacher_conflict', message: 'Teacher is double-booked at that time.' } }
    }
    if (conflict.hasClassConflict) {
      return { success: false, error: { code: 'class_conflict', message: 'Class is double-booked at that time.' } }
    }

    const { data: slot, error } = await admin
      .from('timetable_slots')
      .insert({
        academic_term_id: input.academic_term_id,
        teacher_id: input.teacher_id,
        class_id: input.class_id,
        subject_id: input.subject_id,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
        room: input.room?.trim() || null,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'timetable:create',
      resource_type: 'timetable_slots',
      resource_id: slot.id,
      changes: {
        academic_term_id: input.academic_term_id,
        teacher_id: input.teacher_id,
        class_id: input.class_id,
        subject_id: input.subject_id,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
        room: input.room?.trim() || null,
      },
    })

    return { success: true, slot: slot as TimetableSlotRow }
  } catch (error) {
    console.error('Create timetable slot error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getTimetableSlots(params: {
  academicTermId: string
  classId?: string
  teacherId?: string
}): Promise<TimetableResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createClient()

    let teacherId = params.teacherId
    if (auth.user.role === 'TEACHER') {
      teacherId = await getTeacherIdForUser(auth.user.id, auth.user.school_id)
    }

    let query = supabase
      .from('timetable_slots')
      .select(
        `
        *,
        classes(id, name, grade_level, stream),
        subjects(id, name, code),
        academic_terms(id, year, term, is_current),
        teachers(id, user_id, users(first_name, last_name, email, honorific))
      `
      )
      .eq('academic_term_id', params.academicTermId)

    if (params.classId) query = query.eq('class_id', params.classId)
    if (teacherId) query = query.eq('teacher_id', teacherId)

    const { data: slots, error } = await query
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) throw error
    return { success: true, slots: (slots ?? []) as TimetableSlotWithRefs[] }
  } catch (error) {
    console.error('Get timetable slots error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateTimetableSlot(
  id: string,
  updates: Partial<TimetableSlotRow>
): Promise<TimetableSlotResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: existing, error: existingError } = await admin
      .from('timetable_slots')
      .select('*')
      .eq('id', id)
      .single()

    if (existingError) throw existingError

    const updated = { ...existing, ...updates } as TimetableSlotRow
    const conflict = await checkTimeConflict({
      academicTermId: updated.academic_term_id,
      teacherId: updated.teacher_id,
      classId: updated.class_id,
      dayOfWeek: updated.day_of_week,
      startTime: updated.start_time,
      endTime: updated.end_time,
      excludeSlotId: id,
    })

    if (conflict.hasTeacherConflict) {
      return { success: false, error: { code: 'teacher_conflict', message: 'Teacher is double-booked at that time.' } }
    }
    if (conflict.hasClassConflict) {
      return { success: false, error: { code: 'class_conflict', message: 'Class is double-booked at that time.' } }
    }

    const { data: slot, error } = await admin
      .from('timetable_slots')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'timetable:update',
      resource_type: 'timetable_slots',
      resource_id: id,
      changes: updates,
    })

    return { success: true, slot: slot as TimetableSlotRow }
  } catch (error) {
    console.error('Update timetable slot error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteTimetableSlot(id: string): Promise<TimetableSlotResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: slot, error } = await admin
      .from('timetable_slots')
      .delete()
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'timetable:delete',
      resource_type: 'timetable_slots',
      resource_id: id,
      changes: { id },
    })

    return { success: true, slot: slot as TimetableSlotRow }
  } catch (error) {
    console.error('Delete timetable slot error:', error)
    return { success: false, error: toActionError(error) }
  }
}

