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
