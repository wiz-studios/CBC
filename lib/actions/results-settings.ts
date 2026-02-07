'use server'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type GradeScaleRow = Database['public']['Tables']['grade_scales']['Row']
type GradeBandRow = Database['public']['Tables']['grade_bands']['Row']
type ResultsSettingsRow = Database['public']['Tables']['school_results_settings']['Row']
type SubjectResultsProfileRow = Database['public']['Tables']['subject_results_profiles']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']

type ActionError = { code: string; message: string }
type SignedInUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
type AuthResult = { ok: true; user: SignedInUser } | { ok: false; error: ActionError }

const DEFAULT_KCSE_BANDS: Array<{
  min_score: number
  max_score: number
  letter_grade: string
  points: number
  sort_order: number
}> = [
  { min_score: 80, max_score: 100, letter_grade: 'A', points: 12, sort_order: 1 },
  { min_score: 75, max_score: 79.99, letter_grade: 'A-', points: 11, sort_order: 2 },
  { min_score: 70, max_score: 74.99, letter_grade: 'B+', points: 10, sort_order: 3 },
  { min_score: 65, max_score: 69.99, letter_grade: 'B', points: 9, sort_order: 4 },
  { min_score: 60, max_score: 64.99, letter_grade: 'B-', points: 8, sort_order: 5 },
  { min_score: 55, max_score: 59.99, letter_grade: 'C+', points: 7, sort_order: 6 },
  { min_score: 50, max_score: 54.99, letter_grade: 'C', points: 6, sort_order: 7 },
  { min_score: 45, max_score: 49.99, letter_grade: 'C-', points: 5, sort_order: 8 },
  { min_score: 40, max_score: 44.99, letter_grade: 'D+', points: 4, sort_order: 9 },
  { min_score: 35, max_score: 39.99, letter_grade: 'D', points: 3, sort_order: 10 },
  { min_score: 30, max_score: 34.99, letter_grade: 'D-', points: 2, sort_order: 11 },
  { min_score: 0, max_score: 29.99, letter_grade: 'E', points: 1, sort_order: 12 },
]

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

async function ensureDefaultScaleAndSettings(schoolId: string, updatedBy?: string) {
  const { data: existingScale, error: existingScaleError } = await admin
    .from('grade_scales')
    .select('*')
    .eq('school_id', schoolId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existingScaleError) throw existingScaleError

  let scale = existingScale as GradeScaleRow | null
  if (!scale) {
    const { data: createdScale, error: createScaleError } = await admin
      .from('grade_scales')
      .insert({
        school_id: schoolId,
        name: 'KCSE 12-point (Default)',
        is_default: true,
      })
      .select('*')
      .single()
    if (createScaleError) throw createScaleError
    scale = createdScale as GradeScaleRow
  }

  const { data: existingBands, error: bandsError } = await admin
    .from('grade_bands')
    .select('*')
    .eq('grade_scale_id', scale.id)
    .order('sort_order', { ascending: true })
  if (bandsError) throw bandsError

  if ((existingBands ?? []).length === 0) {
    const { error: insertBandsError } = await admin.from('grade_bands').insert(
      DEFAULT_KCSE_BANDS.map((band) => ({
        grade_scale_id: scale!.id,
        ...band,
      }))
    )
    if (insertBandsError) throw insertBandsError
  }

  const { data: existingSettings, error: existingSettingsError } = await admin
    .from('school_results_settings')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle()
  if (existingSettingsError) throw existingSettingsError

  if (!existingSettings) {
    const { error: insertSettingsError } = await admin.from('school_results_settings').insert({
      school_id: schoolId,
      grade_scale_id: scale.id,
      ranking_method: 'BEST_N',
      ranking_n: 7,
      min_total_subjects: 7,
      max_total_subjects: 9,
      min_sciences: 2,
      max_humanities: 2,
      excluded_subject_codes: ['PE', 'ICT'],
      cat_weight: 30,
      exam_weight: 70,
      updated_by: updatedBy ?? null,
    })
    if (insertSettingsError) throw insertSettingsError
  } else if (!existingSettings.grade_scale_id) {
    const { error: patchError } = await admin
      .from('school_results_settings')
      .update({ grade_scale_id: scale.id, updated_by: updatedBy ?? null })
      .eq('id', existingSettings.id)
    if (patchError) throw patchError
  }
}

export type ResultsSettingsPayload = {
  settings: ResultsSettingsRow
  gradeScale: GradeScaleRow | null
  gradeBands: GradeBandRow[]
  subjects: Pick<SubjectRow, 'id' | 'code' | 'name' | 'curriculum_area' | 'is_compulsory'>[]
  subjectProfiles: SubjectResultsProfileRow[]
}

export type ResultsSettingsResult =
  | { success: true; payload: ResultsSettingsPayload }
  | { success: false; error: ActionError }

export async function getResultsSettings(): Promise<ResultsSettingsResult> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    await ensureDefaultScaleAndSettings(auth.user.school_id, auth.user.id)

    const supabase = await createClient()

    const [
      { data: settings, error: settingsError },
      { data: subjects, error: subjectsError },
      { data: subjectProfiles, error: subjectProfilesError },
    ] = await Promise.all([
      supabase
        .from('school_results_settings')
        .select('*')
        .eq('school_id', auth.user.school_id)
        .single(),
      supabase
        .from('subjects')
        .select('id, code, name, curriculum_area, is_compulsory')
        .eq('school_id', auth.user.school_id)
        .order('name', { ascending: true }),
      supabase
        .from('subject_results_profiles')
        .select('*')
        .eq('school_id', auth.user.school_id),
    ])

    if (settingsError) throw settingsError
    if (subjectsError) throw subjectsError
    if (subjectProfilesError) throw subjectProfilesError

    let gradeScale: GradeScaleRow | null = null
    let gradeBands: GradeBandRow[] = []

    if ((settings as ResultsSettingsRow).grade_scale_id) {
      const [{ data: scale, error: scaleError }, { data: bands, error: bandsError }] = await Promise.all([
        supabase
          .from('grade_scales')
          .select('*')
          .eq('id', (settings as ResultsSettingsRow).grade_scale_id!)
          .single(),
        supabase
          .from('grade_bands')
          .select('*')
          .eq('grade_scale_id', (settings as ResultsSettingsRow).grade_scale_id!)
          .order('sort_order', { ascending: true }),
      ])

      if (scaleError) throw scaleError
      if (bandsError) throw bandsError

      gradeScale = scale as GradeScaleRow
      gradeBands = (bands ?? []) as GradeBandRow[]
    }

    return {
      success: true,
      payload: {
        settings: settings as ResultsSettingsRow,
        gradeScale,
        gradeBands,
        subjects: (subjects ?? []) as any,
        subjectProfiles: (subjectProfiles ?? []) as SubjectResultsProfileRow[],
      },
    }
  } catch (error) {
    console.error('Get results settings error:', error)
    return { success: false, error: toActionError(error) }
  }
}

export async function updateResultsSettings(input: {
  ranking_method: ResultsSettingsRow['ranking_method']
  ranking_n: number
  min_total_subjects: number
  max_total_subjects: number
  min_sciences: number
  max_humanities: number
  excluded_subject_codes: string[]
  cat_weight: number
  exam_weight: number
  grade_bands: Array<Pick<GradeBandRow, 'letter_grade' | 'min_score' | 'max_score' | 'points' | 'sort_order'>>
  subject_profiles?: Array<
    Pick<SubjectResultsProfileRow, 'subject_id' | 'cat_weight' | 'exam_weight' | 'excluded_from_ranking'>
  >
}): Promise<{ success: true } | { success: false; error: ActionError }> {
  const auth = await requireSchoolAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    await ensureDefaultScaleAndSettings(auth.user.school_id, auth.user.id)

    if (input.max_total_subjects < input.min_total_subjects) {
      return {
        success: false,
        error: { code: 'invalid_input', message: 'Maximum total subjects must be >= minimum total subjects.' },
      }
    }
    if (Math.round((input.cat_weight + input.exam_weight) * 100) !== 10000) {
      return { success: false, error: { code: 'invalid_input', message: 'CAT and exam weights must add up to 100.' } }
    }
    if (!input.grade_bands || input.grade_bands.length < 2) {
      return { success: false, error: { code: 'invalid_input', message: 'Provide valid grade bands.' } }
    }

    const { data: settings, error: settingsError } = await admin
      .from('school_results_settings')
      .select('*')
      .eq('school_id', auth.user.school_id)
      .single()
    if (settingsError) throw settingsError

    const gradeScaleId = (settings as ResultsSettingsRow).grade_scale_id
    if (!gradeScaleId) {
      return { success: false, error: { code: 'invalid_state', message: 'No grade scale configured.' } }
    }

    const sanitizedBands = [...input.grade_bands]
      .map((band) => ({
        letter_grade: band.letter_grade.trim(),
        min_score: Number(band.min_score),
        max_score: Number(band.max_score),
        points: Number(band.points),
        sort_order: Number(band.sort_order),
      }))
      .sort((a, b) => a.sort_order - b.sort_order)

    for (const band of sanitizedBands) {
      if (!band.letter_grade) {
        return { success: false, error: { code: 'invalid_input', message: 'Grade letter is required.' } }
      }
      if (!Number.isFinite(band.min_score) || !Number.isFinite(band.max_score) || band.min_score > band.max_score) {
        return { success: false, error: { code: 'invalid_input', message: `Invalid range for ${band.letter_grade}.` } }
      }
      if (!Number.isFinite(band.points)) {
        return { success: false, error: { code: 'invalid_input', message: `Invalid points for ${band.letter_grade}.` } }
      }
    }

    const { error: updateSettingsError } = await admin
      .from('school_results_settings')
      .update({
        ranking_method: input.ranking_method,
        ranking_n: input.ranking_n,
        min_total_subjects: input.min_total_subjects,
        max_total_subjects: input.max_total_subjects,
        min_sciences: input.min_sciences,
        max_humanities: input.max_humanities,
        excluded_subject_codes: input.excluded_subject_codes,
        cat_weight: input.cat_weight,
        exam_weight: input.exam_weight,
        updated_by: auth.user.id,
      })
      .eq('school_id', auth.user.school_id)
    if (updateSettingsError) throw updateSettingsError

    const { error: deleteBandsError } = await admin
      .from('grade_bands')
      .delete()
      .eq('grade_scale_id', gradeScaleId)
    if (deleteBandsError) throw deleteBandsError

    const { error: insertBandsError } = await admin.from('grade_bands').insert(
      sanitizedBands.map((band) => ({
        grade_scale_id: gradeScaleId,
        ...band,
      }))
    )
    if (insertBandsError) throw insertBandsError

    if (input.subject_profiles) {
      const subjectProfiles = input.subject_profiles
        .map((profile) => ({
          school_id: auth.user.school_id,
          subject_id: profile.subject_id,
          cat_weight: profile.cat_weight == null ? null : Number(profile.cat_weight),
          exam_weight: profile.exam_weight == null ? null : Number(profile.exam_weight),
          excluded_from_ranking: Boolean(profile.excluded_from_ranking),
          created_by: auth.user.id,
          updated_at: new Date().toISOString(),
        }))
        .filter((profile) => {
          const hasWeights = profile.cat_weight != null || profile.exam_weight != null
          const hasExclude = profile.excluded_from_ranking
          return hasWeights || hasExclude
        })

      for (const profile of subjectProfiles) {
        const hasOneWeight = (profile.cat_weight == null) !== (profile.exam_weight == null)
        if (hasOneWeight) {
          return {
            success: false,
            error: { code: 'invalid_input', message: 'Subject profile weights require both CAT and exam values.' },
          }
        }
        if (
          profile.cat_weight != null &&
          profile.exam_weight != null &&
          Math.round((profile.cat_weight + profile.exam_weight) * 100) !== 10000
        ) {
          return {
            success: false,
            error: { code: 'invalid_input', message: 'Each subject profile must have weights adding up to 100.' },
          }
        }
      }

      const { error: deleteProfilesError } = await admin
        .from('subject_results_profiles')
        .delete()
        .eq('school_id', auth.user.school_id)
      if (deleteProfilesError) throw deleteProfilesError

      if (subjectProfiles.length > 0) {
        const { error: upsertProfilesError } = await admin
          .from('subject_results_profiles')
          .upsert(subjectProfiles, { onConflict: 'school_id,subject_id' })
        if (upsertProfilesError) throw upsertProfilesError
      }
    }

    await admin.from('audit_logs').insert({
      school_id: auth.user.school_id,
      user_id: auth.user.id,
      action: 'results_settings:update',
      resource_type: 'school_results_settings',
      resource_id: (settings as ResultsSettingsRow).id,
      changes: {
        ranking_method: input.ranking_method,
        ranking_n: input.ranking_n,
        min_total_subjects: input.min_total_subjects,
        max_total_subjects: input.max_total_subjects,
        excluded_subject_codes: input.excluded_subject_codes,
        cat_weight: input.cat_weight,
        exam_weight: input.exam_weight,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Update results settings error:', error)
    return { success: false, error: toActionError(error) }
  }
}
