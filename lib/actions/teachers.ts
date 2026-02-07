'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type TeacherRow = Database['public']['Tables']['teachers']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type TeacherWithUser = TeacherRow & {
  user: Pick<UserRow, 'id' | 'first_name' | 'last_name' | 'email'> | null
}

export type TeachersResult =
  | { success: true; teachers: TeacherWithUser[] }
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

async function getSystemRoleId(roleName: 'TEACHER' | 'HEAD_TEACHER') {
  const { data: role, error } = await admin
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .eq('is_system_role', true)
    .maybeSingle()
  if (error) throw error
  if (!role) throw new Error('RBAC roles not seeded. Run scripts/002_rbac_seed.sql.')
  return role.id as string
}

async function ensureTeacherRow(userId: string, schoolId: string) {
  const { error } = await admin.from('teachers').upsert(
    {
      user_id: userId,
      school_id: schoolId,
    },
    { onConflict: 'user_id,school_id' }
  )
  if (error) throw error
}

export async function getTeachers(): Promise<TeachersResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const isAllowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER'
    if (!isAllowed) {
      return { success: false, error: { code: 'forbidden', message: 'Staff access required.' } }
    }

    // Ensure teacher profiles exist for staff roles created by SUPER_ADMIN
    const { data: roleLinks, error: rolesError } = await admin
      .from('user_roles')
      .select('user_id, roles(name)')
      .eq('school_id', auth.user.school_id)

    if (rolesError) throw rolesError

    const staffUserIds = (roleLinks ?? [])
      .filter((row: any) => row?.roles?.name === 'HEAD_TEACHER' || row?.roles?.name === 'TEACHER')
      .map((row: any) => row.user_id)
      .filter(Boolean)

    if (staffUserIds.length > 0) {
      await admin.from('teachers').upsert(
        staffUserIds.map((userId: string) => ({
          user_id: userId,
          school_id: auth.user.school_id,
        })),
        { onConflict: 'user_id,school_id' }
      )
    }

    const { data: teachers, error: teachersError } = await admin
      .from('teachers')
      .select('*')
      .eq('school_id', auth.user.school_id)
      .order('created_at', { ascending: true })

    if (teachersError) throw teachersError

    const teacherRows = (teachers ?? []) as TeacherRow[]
    const userIds = Array.from(new Set(teacherRows.map((t) => t.user_id).filter(Boolean)))

    const { data: users, error: usersError } =
      userIds.length > 0
        ? await admin.from('users').select('id, first_name, last_name, email').in('id', userIds)
        : { data: [], error: null as any }

    if (usersError) throw usersError

    const userById = new Map<string, Pick<UserRow, 'id' | 'first_name' | 'last_name' | 'email'>>()
    ;((users ?? []) as any[]).forEach((u) => {
      userById.set(u.id, u)
    })

    const enriched: TeacherWithUser[] = teacherRows.map((t) => ({
      ...t,
      user: userById.get(t.user_id) ?? null,
    }))

    return { success: true, teachers: enriched }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

type SeedTeacherDef = {
  gender: 'Male' | 'Female'
  subjects: string[]
}

const KERICHO_TEACHER_SUBJECTS: SeedTeacherDef[] = [
  { gender: 'Male', subjects: ['ENG'] },
  { gender: 'Male', subjects: ['KIS'] },
  { gender: 'Male', subjects: ['MATH'] },
  { gender: 'Male', subjects: ['BIO'] },
  { gender: 'Male', subjects: ['CHEM'] },
  { gender: 'Male', subjects: ['PHY'] },
  { gender: 'Male', subjects: ['HIST'] },
  { gender: 'Male', subjects: ['GEO'] },
  { gender: 'Male', subjects: ['CRE'] },
  { gender: 'Male', subjects: ['BUS'] },
  { gender: 'Female', subjects: ['AGR'] },
  { gender: 'Female', subjects: ['COMP'] },
  { gender: 'Female', subjects: ['LIT'] },
  { gender: 'Female', subjects: ['PE', 'ICT', 'CSL'] },
]

const KERICHO_MALE_NAMES = [
  'Brian',
  'Dennis',
  'Emmanuel',
  'Collins',
  'Japheth',
  'Victor',
  'Kevin',
  'Peter',
  'Samuel',
  'Joseph',
  'Fred',
  'Allan',
  'Caleb',
  'Isaac',
  'Noah',
  'Mark',
  'Martin',
  'Philip',
  'George',
  'Daniel',
]

const KERICHO_FEMALE_NAMES = [
  'Mercy',
  'Faith',
  'Joy',
  'Grace',
  'Esther',
  'Purity',
  'Hannah',
  'Dorcas',
  'Janet',
  'Gladys',
  'Nancy',
  'Lydia',
]

const KERICHO_LAST_NAMES = [
  'Kiptoo',
  'Rono',
  'Kiprotich',
  'Koech',
  'Bett',
  'Kimutai',
  'Langat',
  'Kiprono',
  'Toroitich',
  'Kiplagat',
  'Rotich',
  'Kimosop',
  'Kipngetich',
  'Kipchirchir',
  'Chebet',
  'Cheruiyot',
]

export type SeedKerichoTeachersResult =
  | {
      success: true
      created: number
      existing: number
      assignments: number
      skippedAssignments: number
      teacherCount: number
      maleCount: number
      femaleCount: number
      tempPassword: string
      message: string
    }
  | { success: false; error: ActionError }

export async function seedKerichoTeachersAndAssignments(): Promise<SeedKerichoTeachersResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const schoolId = auth.user.school_id
    const tempPassword = 'Kericho2026!'

    const { data: term, error: termError } = await admin
      .from('academic_terms')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_current', true)
      .maybeSingle()
    if (termError) throw termError
    if (!term?.id) {
      return { success: false, error: { code: 'missing_term', message: 'Set a current academic term first.' } }
    }

    const { data: classes, error: classError } = await admin
      .from('classes')
      .select('id, grade_level')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .in('grade_level', [10, 11, 12])
    if (classError) throw classError
    if (!classes || classes.length === 0) {
      return { success: false, error: { code: 'no_classes', message: 'Create Grade 10-12 classes first.' } }
    }

    const subjectCodes = Array.from(
      new Set(KERICHO_TEACHER_SUBJECTS.flatMap((t) => t.subjects))
    )
    const { data: subjects, error: subjectError } = await admin
      .from('subjects')
      .select('id, code')
      .eq('school_id', schoolId)
      .in('code', subjectCodes)
    if (subjectError) throw subjectError

    const subjectIdByCode = new Map((subjects ?? []).map((s: any) => [s.code.toUpperCase(), s.id as string]))
    const missing = subjectCodes.filter((code) => !subjectIdByCode.has(code.toUpperCase()))
    if (missing.length > 0) {
      return {
        success: false,
        error: { code: 'missing_subjects', message: `Missing subjects: ${missing.join(', ')}` },
      }
    }

    const teacherCount = KERICHO_TEACHER_SUBJECTS.length
    const maleCount = KERICHO_TEACHER_SUBJECTS.filter((t) => t.gender === 'Male').length
    const femaleCount = KERICHO_TEACHER_SUBJECTS.filter((t) => t.gender === 'Female').length

    const teacherSeeds = KERICHO_TEACHER_SUBJECTS.map((def, index) => {
      const nameIndex = index % (def.gender === 'Male' ? KERICHO_MALE_NAMES.length : KERICHO_FEMALE_NAMES.length)
      const firstName = def.gender === 'Male' ? KERICHO_MALE_NAMES[nameIndex] : KERICHO_FEMALE_NAMES[nameIndex]
      const lastName = KERICHO_LAST_NAMES[index % KERICHO_LAST_NAMES.length]
      const email = `teacher${String(index + 1).padStart(2, '0')}@kh.co.ke`
      const honorific = def.gender === 'Female' ? 'Mrs' : 'Mr'
      return {
        ...def,
        first_name: firstName,
        last_name: lastName,
        email,
        honorific,
      }
    })

    const emails = teacherSeeds.map((t) => t.email)
    const { data: existingUsers, error: existingError } = await admin
      .from('users')
      .select('id, email, school_id')
      .in('email', emails)
    if (existingError) throw existingError

    const existingByEmail = new Map((existingUsers ?? []).map((u: any) => [String(u.email).toLowerCase(), u]))
    const teacherRoleId = await getSystemRoleId('TEACHER')

    let created = 0
    let existing = 0
    const teacherIdByEmail = new Map<string, string>()

    for (const seed of teacherSeeds) {
      const key = seed.email.toLowerCase()
      const existingUser = existingByEmail.get(key)
      let userId: string | null = null

      if (existingUser) {
        existing += 1
        userId = existingUser.id as string
      } else {
        const { data: authData, error: authError } = await admin.auth.admin.createUser({
          email: seed.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { first_name: seed.first_name, last_name: seed.last_name },
        })
        if (authError) throw authError
        if (!authData?.user?.id) throw new Error('Failed to create auth user.')

        userId = authData.user.id
        const { error: insertError } = await admin
          .from('users')
          .insert({
            id: userId,
            school_id: schoolId,
            email: seed.email,
            first_name: seed.first_name,
            last_name: seed.last_name,
            honorific: seed.honorific,
            status: 'ACTIVE',
            auth_id: userId,
          })
        if (insertError) {
          await admin.auth.admin.deleteUser(userId)
          throw insertError
        }

        await admin.from('user_roles').upsert(
          {
            user_id: userId,
            role_id: teacherRoleId,
            school_id: schoolId,
          },
          { onConflict: 'user_id,role_id,school_id' }
        )

        await admin.from('audit_logs').insert({
          school_id: schoolId,
          user_id: auth.user.id,
          action: 'teachers:seed_create',
          resource_type: 'users',
          resource_id: userId,
          changes: { email: seed.email, role: 'TEACHER' },
        })

        created += 1
      }

      if (!userId) continue
      await ensureTeacherRow(userId, schoolId)

      const { data: teacherRow, error: teacherError } = await admin
        .from('teachers')
        .select('id')
        .eq('user_id', userId)
        .eq('school_id', schoolId)
        .maybeSingle()
      if (teacherError) throw teacherError
      if (teacherRow?.id) {
        teacherIdByEmail.set(seed.email.toLowerCase(), teacherRow.id as string)
      }
    }

    const assignments: Array<Record<string, unknown>> = []
    let skippedAssignments = 0

    for (const seed of teacherSeeds) {
      const teacherId = teacherIdByEmail.get(seed.email.toLowerCase())
      if (!teacherId) {
        skippedAssignments += seed.subjects.length * classes.length
        continue
      }

      for (const subjectCode of seed.subjects) {
        const subjectId = subjectIdByCode.get(subjectCode.toUpperCase())
        if (!subjectId) {
          skippedAssignments += classes.length
          continue
        }

        for (const c of classes) {
          assignments.push({
            teacher_id: teacherId,
            class_id: c.id,
            subject_id: subjectId,
            academic_term_id: term.id,
          })
        }
      }
    }

    if (assignments.length > 0) {
      const { error: assignmentError } = await admin
        .from('teacher_class_assignments')
        .upsert(assignments, { onConflict: 'teacher_id,class_id,subject_id,academic_term_id' })
      if (assignmentError) throw assignmentError
    }

    await admin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: auth.user.id,
      action: 'teachers:seed_assignments',
      resource_type: 'teacher_class_assignments',
      resource_id: null,
      changes: {
        term_id: term.id,
        teachers: teacherCount,
        assignments: assignments.length,
        skipped: skippedAssignments,
      },
    })

    return {
      success: true,
      created,
      existing,
      assignments: assignments.length,
      skippedAssignments,
      teacherCount,
      maleCount,
      femaleCount,
      tempPassword,
      message: 'Kericho teachers seeded and assignments applied.',
    }
  } catch (error) {
    console.error('Seed Kericho teachers error:', error)
    return { success: false, error: toActionError(error) }
  }
}
