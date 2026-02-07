'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getResultsSettings, updateResultsSettings } from '@/lib/actions/results-settings'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type BandState = {
  letter_grade: string
  min_score: string
  max_score: string
  points: string
  sort_order: number
}

type SubjectProfileState = {
  subject_id: string
  cat_weight: string
  exam_weight: string
  excluded_from_ranking: boolean
}

export function ResultsSettingsForm({ canEdit }: { canEdit: boolean }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [rankingMethod, setRankingMethod] = useState<'BEST_N' | 'ALL_TAKEN'>('BEST_N')
  const [rankingN, setRankingN] = useState('7')
  const [minSubjects, setMinSubjects] = useState('7')
  const [maxSubjects, setMaxSubjects] = useState('9')
  const [minSciences, setMinSciences] = useState('2')
  const [maxHumanities, setMaxHumanities] = useState('2')
  const [catWeight, setCatWeight] = useState('30')
  const [examWeight, setExamWeight] = useState('70')
  const [excludedCodes, setExcludedCodes] = useState<string[]>([])
  const [subjects, setSubjects] = useState<
    Array<{ id: string; code: string; name: string; curriculum_area: string | null }>
  >([])
  const [subjectProfiles, setSubjectProfiles] = useState<Record<string, SubjectProfileState>>({})
  const [bands, setBands] = useState<BandState[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getResultsSettings()
    if (!result.success) {
      toast.error('Failed to load results settings', { description: result.error.message })
      setLoading(false)
      return
    }

    const { settings, gradeBands, subjects: subjectRows, subjectProfiles: profileRows } = result.payload
    setRankingMethod(settings.ranking_method)
    setRankingN(String(settings.ranking_n))
    setMinSubjects(String(settings.min_total_subjects))
    setMaxSubjects(String(settings.max_total_subjects))
    setMinSciences(String(settings.min_sciences))
    setMaxHumanities(String(settings.max_humanities))
    setCatWeight(String(settings.cat_weight))
    setExamWeight(String(settings.exam_weight))
    setExcludedCodes(settings.excluded_subject_codes ?? [])
    setSubjects(
      subjectRows.map((subject) => ({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        curriculum_area: subject.curriculum_area,
      }))
    )
    const nextProfiles: Record<string, SubjectProfileState> = {}
    for (const row of profileRows) {
      nextProfiles[row.subject_id] = {
        subject_id: row.subject_id,
        cat_weight: row.cat_weight == null ? '' : String(row.cat_weight),
        exam_weight: row.exam_weight == null ? '' : String(row.exam_weight),
        excluded_from_ranking: Boolean(row.excluded_from_ranking),
      }
    }
    setSubjectProfiles(nextProfiles)
    setBands(
      gradeBands.map((band) => ({
        letter_grade: band.letter_grade,
        min_score: String(band.min_score),
        max_score: String(band.max_score),
        points: String(band.points),
        sort_order: band.sort_order,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleExcludedCode = (code: string, checked: boolean) => {
    setExcludedCodes((prev) => {
      if (checked) return Array.from(new Set([...prev, code]))
      return prev.filter((item) => item !== code)
    })
  }

  const totalWeight = useMemo(() => Number(catWeight || 0) + Number(examWeight || 0), [catWeight, examWeight])

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)

    const payloadBands = bands.map((band, index) => ({
      letter_grade: band.letter_grade.trim(),
      min_score: Number(band.min_score),
      max_score: Number(band.max_score),
      points: Number(band.points),
      sort_order: index + 1,
    }))

    const result = await updateResultsSettings({
      ranking_method: rankingMethod,
      ranking_n: Number(rankingN),
      min_total_subjects: Number(minSubjects),
      max_total_subjects: Number(maxSubjects),
      min_sciences: Number(minSciences),
      max_humanities: Number(maxHumanities),
      excluded_subject_codes: excludedCodes,
      cat_weight: Number(catWeight),
      exam_weight: Number(examWeight),
      grade_bands: payloadBands,
      subject_profiles: Object.values(subjectProfiles).map((profile) => ({
        subject_id: profile.subject_id,
        cat_weight: profile.cat_weight.trim() === '' ? null : Number(profile.cat_weight),
        exam_weight: profile.exam_weight.trim() === '' ? null : Number(profile.exam_weight),
        excluded_from_ranking: profile.excluded_from_ranking,
      })),
    })

    if (!result.success) {
      toast.error('Save failed', { description: result.error.message })
      setSaving(false)
      return
    }

    toast.success('Results settings updated')
    setSaving(false)
    await load()
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
        Loading results settings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Ranking & load</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ranking method</Label>
              <Select value={rankingMethod} onValueChange={(value) => setRankingMethod(value as 'BEST_N' | 'ALL_TAKEN')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEST_N">BEST_N</SelectItem>
                  <SelectItem value="ALL_TAKEN">ALL_TAKEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ranking N</Label>
              <Input value={rankingN} onChange={(event) => setRankingN(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Min total subjects</Label>
              <Input value={minSubjects} onChange={(event) => setMinSubjects(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max total subjects</Label>
              <Input value={maxSubjects} onChange={(event) => setMaxSubjects(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Min sciences</Label>
              <Input value={minSciences} onChange={(event) => setMinSciences(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max humanities</Label>
              <Input value={maxHumanities} onChange={(event) => setMaxHumanities(event.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Assessment weights</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CAT weight (%)</Label>
              <Input value={catWeight} onChange={(event) => setCatWeight(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Exam weight (%)</Label>
              <Input value={examWeight} onChange={(event) => setExamWeight(event.target.value)} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Total weight: {totalWeight}%</div>

          <div className="pt-2">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Excluded from ranking</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {subjects.map((subject) => (
                <label key={subject.code} className="flex items-center gap-2 text-sm rounded-md border border-border/60 px-3 py-2">
                  <Checkbox
                    checked={excludedCodes.includes(subject.code)}
                    onCheckedChange={(value) => toggleExcludedCode(subject.code, value === true)}
                  />
                  <span>
                    {subject.code} - {subject.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Subject-specific weighting profiles
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left">Subject</th>
                <th className="px-3 py-2 text-left">CAT %</th>
                <th className="px-3 py-2 text-left">Exam %</th>
                <th className="px-3 py-2 text-left">Exclude from ranking</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const profile = subjectProfiles[subject.id] ?? {
                  subject_id: subject.id,
                  cat_weight: '',
                  exam_weight: '',
                  excluded_from_ranking: false,
                }
                return (
                  <tr key={subject.id} className="border-b border-border/40">
                    <td className="px-3 py-2">
                      {subject.code} - {subject.name}
                    </td>
                    <td className="px-3 py-2 w-32">
                      <Input
                        value={profile.cat_weight}
                        placeholder={catWeight}
                        onChange={(event) =>
                          setSubjectProfiles((prev) => ({
                            ...prev,
                            [subject.id]: { ...profile, cat_weight: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 w-32">
                      <Input
                        value={profile.exam_weight}
                        placeholder={examWeight}
                        onChange={(event) =>
                          setSubjectProfiles((prev) => ({
                            ...prev,
                            [subject.id]: { ...profile, exam_weight: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2">
                        <Checkbox
                          checked={profile.excluded_from_ranking}
                          onCheckedChange={(value) =>
                            setSubjectProfiles((prev) => ({
                              ...prev,
                              [subject.id]: {
                                ...profile,
                                excluded_from_ranking: value === true,
                              },
                            }))
                          }
                        />
                        <span>Exclude</span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted-foreground">
          Leave CAT/Exam blank to inherit global weights. If set, per-subject CAT + Exam must total 100.
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Grade bands (KCSE style)</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left">Grade</th>
                <th className="px-3 py-2 text-left">Min score</th>
                <th className="px-3 py-2 text-left">Max score</th>
                <th className="px-3 py-2 text-left">Points</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band, index) => (
                <tr key={`${band.letter_grade}-${index}`} className="border-b border-border/40">
                  <td className="px-3 py-2">
                    <Input
                      value={band.letter_grade}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, letter_grade: event.target.value } : row
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={band.min_score}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, min_score: event.target.value } : row
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={band.max_score}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, max_score: event.target.value } : row
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={band.points}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, points: event.target.value } : row
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save results settings'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these settings, but only School Admin can edit them.</p>
      )}
    </div>
  )
}
