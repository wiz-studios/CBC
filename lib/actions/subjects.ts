'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type SubjectRow = Database['public']['Tables']['subjects']['Row']
type ClassSubjectRow = Database['public']['Tables']['class_subjects']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type SubjectsResult =
  | { success: true; subjects: SubjectRow[] }
  | { success: false; error: ActionError }

export type SubjectResult =
  | { success: true; subject: SubjectRow }
  | { success: false; error: ActionError }

export type SeniorSchoolSeedResult =
  | { success: true; created: number; assigned: number; message: string }
  | { success: false; error: ActionError }

export type KerichoSubjectProfileResult =
  | {
      success: true
      created_subjects: number
      class_subject_links_upserted: number
      class_subject_links_removed: number
      enabled_subject_codes: string[]
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

type SubjectSeed = {
  code: string
  name: string
  curriculum_area: string
  is_compulsory: boolean
  description?: string
}

const SENIOR_CORE_CODES = ['ENG', 'KIS', 'MATH', 'CSL']
const KERICHO_RECOMMENDED_CODES = [
  'ENG',
  'KIS',
  'MATH',
  'CSL',
  'BIO',
  'CHEM',
  'PHY',
  'HIST',
  'GEO',
  'CRE',
  'BUS',
  'AGR',
  'COMP',
  'LIT',
  'PE',
  'ICT',
]

const SENIOR_SCHOOL_SUBJECTS: SubjectSeed[] = [
  { code: 'ENG', name: 'English', curriculum_area: 'Core', is_compulsory: true },
  { code: 'KIS', name: 'Kiswahili', curriculum_area: 'Core', is_compulsory: true },
  { code: 'MATH', name: 'Mathematics', curriculum_area: 'Core', is_compulsory: true },
  { code: 'CSL', name: 'Community Service Learning', curriculum_area: 'Core', is_compulsory: true },
  { code: 'PE', name: 'Physical Education', curriculum_area: 'Support', is_compulsory: false },
  { code: 'ICT', name: 'ICT Skills', curriculum_area: 'Support', is_compulsory: false },
  { code: 'BIO', name: 'Biology', curriculum_area: 'STEM - Pure Sciences', is_compulsory: false },
  { code: 'CHEM', name: 'Chemistry', curriculum_area: 'STEM - Pure Sciences', is_compulsory: false },
  { code: 'PHY', name: 'Physics', curriculum_area: 'STEM - Pure Sciences', is_compulsory: false },
  { code: 'GSCI', name: 'General Science', curriculum_area: 'STEM - Pure Sciences', is_compulsory: false },
  { code: 'AGR', name: 'Agriculture', curriculum_area: 'STEM - Applied Sciences', is_compulsory: false },
  { code: 'HMSC', name: 'Home Science', curriculum_area: 'STEM - Applied Sciences', is_compulsory: false },
  { code: 'COMP', name: 'Computer Studies', curriculum_area: 'STEM - Applied Sciences', is_compulsory: false },
  { code: 'AVI', name: 'Aviation Technology', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'POWER', name: 'Power Mechanics', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'ELEC', name: 'Electricity', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'WOOD', name: 'Woodwork', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'METAL', name: 'Metalwork', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'BUILD', name: 'Building Construction', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'MARINE', name: 'Marine & Fisheries Technology', curriculum_area: 'STEM - Technical', is_compulsory: false },
  { code: 'HIST', name: 'History and Citizenship', curriculum_area: 'Social - Humanities', is_compulsory: false },
  { code: 'GEO', name: 'Geography', curriculum_area: 'Social - Humanities', is_compulsory: false },
  { code: 'CRE', name: 'Religious Education (CRE)', curriculum_area: 'Social - Humanities', is_compulsory: false },
  { code: 'IRE', name: 'Religious Education (IRE)', curriculum_area: 'Social - Humanities', is_compulsory: false },
  { code: 'HRE', name: 'Religious Education (HRE)', curriculum_area: 'Social - Humanities', is_compulsory: false },
  { code: 'LIT', name: 'Literature in English', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'FAS', name: 'Fasihi ya Kiswahili', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'IND', name: 'Indigenous Languages', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'FR', name: 'French', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'DE', name: 'German', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'AR', name: 'Arabic', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'ZH', name: 'Mandarin Chinese', curriculum_area: 'Social - Languages', is_compulsory: false },
  { code: 'ENT', name: 'Entrepreneurship', curriculum_area: 'Social - Business', is_compulsory: false },
  { code: 'BUS', name: 'Business Studies', curriculum_area: 'Social - Business', is_compulsory: false },
  { code: 'MUS', name: 'Music', curriculum_area: 'Arts - Performing', is_compulsory: false },
  { code: 'DAN', name: 'Dance', curriculum_area: 'Arts - Performing', is_compulsory: false },
  { code: 'THE', name: 'Theatre', curriculum_area: 'Arts - Performing', is_compulsory: false },
  { code: 'FILM', name: 'Film', curriculum_area: 'Arts - Performing', is_compulsory: false },
  { code: 'ART', name: 'Fine Arts', curriculum_area: 'Arts - Visual', is_compulsory: false },
  { code: 'MEDIA', name: 'Media Studies', curriculum_area: 'Arts - Visual', is_compulsory: false },
  { code: 'SPORT', name: 'Sports and Recreation', curriculum_area: 'Arts - Sports', is_compulsory: false },
]

export async function seedSeniorSchoolSubjects(): Promise<SeniorSchoolSeedResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const codes = SENIOR_SCHOOL_SUBJECTS.map((s) => s.code)
    const { data: existingSubjects, error: existingError } = await admin
      .from('subjects')
      .select('code')
      .eq('school_id', auth.user.school_id)
      .in('code', codes)

    if (existingError) throw existingError
    const existingCodes = new Set((existingSubjects ?? []).map((s) => s.code))

    const toInsert = SENIOR_SCHOOL_SUBJECTS.filter((s) => !existingCodes.has(s.code))

    if (toInsert.length > 0) {
      const { error: insertError } = await admin.from('subjects').insert(
        toInsert.map((s) => ({
          school_id: auth.user.school_id,
          code: s.code,
          name: s.name,
          description: s.description ?? null,
          curriculum_area: s.curriculum_area,
          is_compulsory: s.is_compulsory,
        }))
      )
      if (insertError) throw insertError
    }

    const { data: coreSubjects, error: coreError } = await admin
      .from('subjects')
      .select('id, code')
      .eq('school_id', auth.user.school_id)
      .in('code', SENIOR_CORE_CODES)

    if (coreError) throw coreError

    const { data: classes, error: classError } = await admin
      .from('classes')
      .select('id, grade_level')
      .eq('school_id', auth.user.school_id)
      .in('grade_level', [10, 11, 12])
      .eq('is_active', true)

    if (classError) throw classError

    const assignments =
      classes && coreSubjects
        ? classes.flatMap((c) => coreSubjects.map((s) => ({ class_id: c.id, subject_id: s.id })))
        : []

    if (assignments.length > 0) {
      const { error: assignError } = await admin
        .from('class_subjects')
        .upsert(assignments, { onConflict: 'class_id,subject_id' })

      if (assignError) throw assignError
    }

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subjects:seed_senior_school',
      resource_type: 'subjects',
      resource_id: null,
      changes: {
        created_subjects: toInsert.length,
        assigned_core_subjects: assignments.length,
        grades: [10, 11, 12],
      },
    })

    return {
      success: true,
      created: toInsert.length,
      assigned: assignments.length,
      message: 'Senior school subjects seeded.',
    }
  } catch (error) {
    console.error('Seed senior school subjects error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function applyKerichoRecommendedSeniorSubjects(): Promise<KerichoSubjectProfileResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const recommendedSeeds = SENIOR_SCHOOL_SUBJECTS.filter((subject) =>
      KERICHO_RECOMMENDED_CODES.includes(subject.code)
    )

    const { data: existingSubjects, error: existingSubjectsError } = await admin
      .from('subjects')
      .select('id, code')
      .eq('school_id', auth.user.school_id)
      .in('code', KERICHO_RECOMMENDED_CODES)
    if (existingSubjectsError) throw existingSubjectsError

    const existingCodeSet = new Set((existingSubjects ?? []).map((subject) => subject.code))
    const missing = recommendedSeeds.filter((subject) => !existingCodeSet.has(subject.code))

    if (missing.length > 0) {
      const { error: insertMissingError } = await admin.from('subjects').insert(
        missing.map((subject) => ({
          school_id: auth.user.school_id,
          code: subject.code,
          name: subject.name,
          description: subject.description ?? null,
          curriculum_area: subject.curriculum_area,
          is_compulsory: SENIOR_CORE_CODES.includes(subject.code),
        }))
      )
      if (insertMissingError) throw insertMissingError
    }

    const { data: finalSubjects, error: finalSubjectsError } = await admin
      .from('subjects')
      .select('id, code')
      .eq('school_id', auth.user.school_id)
      .in('code', KERICHO_RECOMMENDED_CODES)
    if (finalSubjectsError) throw finalSubjectsError

    const coreCodes = new Set(SENIOR_CORE_CODES)
    for (const subject of finalSubjects ?? []) {
      const shouldBeCompulsory = coreCodes.has(subject.code)
      const { error: updateCompulsoryError } = await admin
        .from('subjects')
        .update({ is_compulsory: shouldBeCompulsory })
        .eq('id', subject.id)
      if (updateCompulsoryError) throw updateCompulsoryError
    }

    const { data: classes, error: classesError } = await admin
      .from('classes')
      .select('id')
      .eq('school_id', auth.user.school_id)
      .in('grade_level', [10, 11, 12])
      .eq('is_active', true)
    if (classesError) throw classesError

    const classIds = (classes ?? []).map((row) => row.id as string)
    const subjectIds = (finalSubjects ?? []).map((row) => row.id as string)

    const links = classIds.flatMap((classId) =>
      subjectIds.map((subjectId) => ({
        class_id: classId,
        subject_id: subjectId,
      }))
    )
    if (links.length > 0) {
      const { error: upsertLinksError } = await admin
        .from('class_subjects')
        .upsert(links, { onConflict: 'class_id,subject_id' })
      if (upsertLinksError) throw upsertLinksError
    }

    let removed = 0
    if (classIds.length > 0) {
      const { data: existingClassSubjects, error: existingClassSubjectsError } = await admin
        .from('class_subjects')
        .select('id, class_id, subject_id')
        .in('class_id', classIds)
      if (existingClassSubjectsError) throw existingClassSubjectsError

      const recommendedSubjectSet = new Set(subjectIds)
      const idsToRemove = (existingClassSubjects ?? [])
        .filter((row) => !recommendedSubjectSet.has(row.subject_id))
        .map((row) => row.id as string)

      if (idsToRemove.length > 0) {
        const { error: removeError } = await admin.from('class_subjects').delete().in('id', idsToRemove)
        if (removeError) throw removeError
        removed = idsToRemove.length
      }
    }

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subjects:apply_kericho_profile',
      resource_type: 'subjects',
      resource_id: null,
      changes: {
        created_subjects: missing.length,
        links_upserted: links.length,
        links_removed: removed,
        subject_codes: KERICHO_RECOMMENDED_CODES,
      },
    })

    return {
      success: true,
      created_subjects: missing.length,
      class_subject_links_upserted: links.length,
      class_subject_links_removed: removed,
      enabled_subject_codes: KERICHO_RECOMMENDED_CODES,
      message: 'Kericho recommended senior subject profile applied.',
    }
  } catch (error) {
    console.error('Apply Kericho recommended subjects error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function createSubject(input: {
  code: string
  name: string
  description?: string | null
  curriculum_area?: string | null
  is_compulsory?: boolean
}): Promise<SubjectResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    if (!code) return { success: false, error: { code: 'invalid_input', message: 'Subject code is required.' } }
    if (!name) return { success: false, error: { code: 'invalid_input', message: 'Subject name is required.' } }

    const { data: subject, error } = await admin
      .from('subjects')
      .insert({
        school_id: auth.user.school_id,
        code,
        name,
        description: input.description?.trim() || null,
        curriculum_area: input.curriculum_area?.trim() || null,
        is_compulsory: input.is_compulsory ?? true,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subjects:create',
      resource_type: 'subjects',
      resource_id: subject.id,
      changes: { code, name },
    })

    return { success: true, subject: subject as SubjectRow }
  } catch (error) {
    console.error('Create subject error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getSubjects(params?: { schoolId?: string }): Promise<SubjectsResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const schoolId = auth.user.role === 'SUPER_ADMIN' && params?.schoolId ? params.schoolId : auth.user.school_id
    const supabase = await createClient()
    const { data: subjects, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolId)
      .order('name', { ascending: true })

    if (error) throw error
    return { success: true, subjects: (subjects ?? []) as SubjectRow[] }
  } catch (error) {
    console.error('Get subjects error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getSubjectById(id: string) {
  try {
    const supabase = await createClient()
    const { data: subject, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return subject as SubjectRow
  } catch (error) {
    console.error('Get subject by id error:', error)
    return null
  }
}

export async function updateSubject(id: string, updates: Partial<SubjectRow>): Promise<SubjectResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: subject, error } = await admin
      .from('subjects')
      .update(updates)
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subjects:update',
      resource_type: 'subjects',
      resource_id: subject.id,
      changes: updates,
    })

    return { success: true, subject: subject as SubjectRow }
  } catch (error) {
    console.error('Update subject error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteSubject(id: string) {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: subject, error } = await admin
      .from('subjects')
      .delete()
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'subjects:delete',
      resource_type: 'subjects',
      resource_id: subject.id,
      changes: { id: subject.id },
    })

    return { success: true, subject: subject as SubjectRow }
  } catch (error) {
    console.error('Delete subject error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getClassSubjects(classId: string) {
  try {
    const supabase = await createClient()
    const { data: classSubjects, error } = await supabase
      .from('class_subjects')
      .select('subject_id, subjects(*)')
      .eq('class_id', classId)

    if (error) throw error
    return (classSubjects ?? []).map((cs: any) => cs.subjects).filter(Boolean) as SubjectRow[]
  } catch (error) {
    console.error('Get class subjects error:', error)
    return []
  }
}

export async function assignSubjectToClass(classId: string, subjectId: string) {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data, error } = await admin
      .from('class_subjects')
      .insert({ class_id: classId, subject_id: subjectId })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'class_subjects:create',
      resource_type: 'class_subjects',
      resource_id: (data as ClassSubjectRow).id,
      changes: { class_id: classId, subject_id: subjectId },
    })

    return { success: true, assignment: data as ClassSubjectRow }
  } catch (error) {
    console.error('Assign subject to class error:', error)
    return { success: false, error: toActionError(error) }
  }
}
