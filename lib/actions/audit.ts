'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type AuditRow = Database['public']['Tables']['audit_logs']['Row']
type SchoolRow = Database['public']['Tables']['schools']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type AuditLogItem = AuditRow & {
  school: Pick<SchoolRow, 'id' | 'name' | 'code'> | null
  actor: Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name'> | null
}

export type AuditLogsResult =
  | { success: true; logs: AuditLogItem[] }
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

export async function getAuditLogs(params?: { limit?: number }): Promise<AuditLogsResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const isAllowed = auth.user.role === 'SUPER_ADMIN' || auth.user.role === 'SCHOOL_ADMIN'
    if (!isAllowed) {
      return { success: false, error: { code: 'forbidden', message: 'Admin access required.' } }
    }

    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200)

    let q = admin
      .from('audit_logs')
      .select('id, school_id, user_id, action, resource_type, resource_id, changes, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (auth.user.role === 'SCHOOL_ADMIN') {
      q = q.eq('school_id', auth.user.school_id)
    }

    const { data, error } = await q
    if (error) throw error

    const rows = (data ?? []) as AuditRow[]
    if (rows.length === 0) return { success: true, logs: [] }

    const schoolIds = Array.from(new Set(rows.map((r) => r.school_id).filter(Boolean)))
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[]

    const [schoolsResult, usersResult] = await Promise.all([
      schoolIds.length ? admin.from('schools').select('id, name, code').in('id', schoolIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? admin.from('users').select('id, email, first_name, last_name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    ])

    const schoolById = new Map<string, Pick<SchoolRow, 'id' | 'name' | 'code'>>()
    ;(schoolsResult.data ?? []).forEach((s: any) => {
      schoolById.set(s.id, s)
    })

    const userById = new Map<string, Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name'>>()
    ;(usersResult.data ?? []).forEach((u: any) => {
      userById.set(u.id, u)
    })

    const enriched: AuditLogItem[] = rows.map((r) => ({
      ...r,
      school: schoolById.get(r.school_id) ?? null,
      actor: r.user_id ? userById.get(r.user_id) ?? null : null,
    }))

    return { success: true, logs: enriched }
  } catch (error) {
    return { success: false, error: toActionError(error) }
  }
}

