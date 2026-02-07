'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type AcademicTermRow = Database['public']['Tables']['academic_terms']['Row']

type ActionError = { code: string; message: string }

type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

export type TermsResult =
  | { success: true; terms: AcademicTermRow[] }
  | { success: false; error: ActionError }
 
export type TermResult =
  | { success: true; term: AcademicTermRow }
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

async function requireSchoolStaff(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  const allowed = auth.user.role === 'SCHOOL_ADMIN' || auth.user.role === 'HEAD_TEACHER' || auth.user.role === 'TEACHER'
  if (!allowed) {
    return { ok: false, error: { code: 'forbidden', message: 'School staff access required.' } }
  }
  return auth
}

async function requireSchoolAdmin(): Promise<AuthResult> {
  const auth = await requireSignedIn()
  if (!auth.ok) return auth
  if (auth.user.role !== 'SCHOOL_ADMIN') {
    return { ok: false, error: { code: 'forbidden', message: 'School admin access required.' } }
  }
  return auth
}

export async function createAcademicTerm(input: {
  year: number
  term: 1 | 2 | 3
  term_name?: string | null
  start_date: string
  end_date: string
  is_current?: boolean
}): Promise<TermResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error } = await admin
      .from('academic_terms')
      .insert({
        school_id: auth.user.school_id,
        year: input.year,
        term: input.term,
        term_name: input.term_name?.trim() || null,
        start_date: input.start_date,
        end_date: input.end_date,
        is_current: input.is_current ?? false,
      })
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'terms:create',
      resource_type: 'academic_terms',
      resource_id: term.id,
      changes: { year: input.year, term: input.term, is_current: input.is_current ?? false },
    })

    if (input.is_current) {
      await setCurrentTerm(term.school_id, term.id)
    }

    return { success: true, term: term as AcademicTermRow }
  } catch (error) {
    console.error('Create academic term error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getAcademicTerms(params?: { schoolId?: string }): Promise<TermsResult> {
  const auth = await requireSchoolStaff()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const schoolId = auth.user.school_id
    const supabase = await createClient()
    const { data: terms, error } = await supabase
      .from('academic_terms')
      .select('*')
      .eq('school_id', schoolId)
      .order('year', { ascending: false })
      .order('term', { ascending: false })

    if (error) throw error
    return { success: true, terms: (terms ?? []) as AcademicTermRow[] }
  } catch (error) {
    console.error('Get academic terms error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function getAcademicTermById(id: string) {
  try {
    const supabase = await createClient()
    const { data: term, error } = await supabase
      .from('academic_terms')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return term as AcademicTermRow
  } catch (error) {
    console.error('Get academic term by id error:', error)
    return null
  }
}

export async function updateAcademicTerm(id: string, updates: Partial<AcademicTermRow>): Promise<TermResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error } = await admin
      .from('academic_terms')
      .update(updates)
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'terms:update',
      resource_type: 'academic_terms',
      resource_id: term.id,
      changes: updates,
    })

    return { success: true, term: term as AcademicTermRow }
  } catch (error) {
    console.error('Update academic term error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function deleteAcademicTerm(id: string) {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const { data: term, error } = await admin
      .from('academic_terms')
      .delete()
      .eq('id', id)
      .eq('school_id', auth.user.school_id)
      .select('*')
      .single()

    if (error) throw error

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'terms:delete',
      resource_type: 'academic_terms',
      resource_id: term.id,
      changes: { id: term.id },
    })

    return { success: true, term: term as AcademicTermRow }
  } catch (error) {
    console.error('Delete academic term error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function setCurrentTerm(schoolId: string, termId: string): Promise<TermResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    if (auth.user.school_id !== schoolId) {
      return { success: false, error: { code: 'forbidden', message: 'Cannot change another school term.' } }
    }

    const { error: unsetError } = await admin
      .from('academic_terms')
      .update({ is_current: false })
      .eq('school_id', schoolId)

    if (unsetError) throw unsetError

    const { data: term, error: setError } = await admin
      .from('academic_terms')
      .update({ is_current: true })
      .eq('id', termId)
      .eq('school_id', schoolId)
      .select('*')
      .single()

    if (setError) throw setError

    await admin.from('audit_logs').insert({
      school_id: schoolId,
      user_id: auth.user.id,
      action: 'terms:set_current',
      resource_type: 'academic_terms',
      resource_id: termId,
      changes: { term_id: termId },
    })

    return { success: true, term: term as AcademicTermRow }
  } catch (error) {
    console.error('Set current term error:', error)
    return { success: false, error: toActionError(error) }
  }
}
