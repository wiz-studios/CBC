'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { getSubjects } from '@/lib/actions/subjects'
import { getAssessmentMarks, getAssessments, upsertStudentMarksBulk } from '@/lib/actions/marks'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type StudentRow = Database['public']['Tables']['students']['Row']
type AssessmentRow = Database['public']['Tables']['assessments']['Row']

type MarkState = Record<string, string>

export function MarksEntry() {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')

  const [loadingLookups, setLoadingLookups] = useState(true)
  const [loadingAssessments, setLoadingAssessments] = useState(false)

  const [loadingMarks, setLoadingMarks] = useState(false)
  const [saving, setSaving] = useState(false)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [maxScore, setMaxScore] = useState<number>(100)
  const [markState, setMarkState] = useState<MarkState>({})

  const loadLookups = useCallback(async () => {
    setLoadingLookups(true)
    const [termsResult, classesResult, subjectsResult] = await Promise.all([
      getAcademicTerms(),
      getClasses({ includeInactive: false }),
      getSubjects(),
    ])

    if (termsResult.success) {
      setTerms(termsResult.terms)
      const current = termsResult.terms.find((t) => t.is_current)
      const termId = (current?.id as string) || (termsResult.terms[0]?.id as string) || ''
      setSelectedTermId(termId)
    } else {
      toast.error('Failed to load terms', { description: termsResult.error.message })
    }

    if (classesResult.success) setClasses(classesResult.classes)
    else toast.error('Failed to load classes', { description: classesResult.error.message })

    if (subjectsResult.success) setSubjects(subjectsResult.subjects)
    else toast.error('Failed to load subjects', { description: subjectsResult.error.message })

    setLoadingLookups(false)
  }, [])

  const loadAssessments = useCallback(async () => {
    if (!selectedTermId || !selectedClassId || !selectedSubjectId) {
      setAssessments([])
      setSelectedAssessmentId('')
      return
    }

    setLoadingAssessments(true)
    const result = await getAssessments({
      academicTermId: selectedTermId,
      classId: selectedClassId,
      subjectId: selectedSubjectId,
    })

    if (!result.success) {
      toast.error('Failed to load assessments', { description: result.error.message })
      setAssessments([])
      setSelectedAssessmentId('')
      setLoadingAssessments(false)
      return
    }

    setAssessments(result.assessments)
    const first = result.assessments[0]?.id ?? ''
    setSelectedAssessmentId((prev) => (prev && result.assessments.some((a) => a.id === prev) ? prev : first))
    setLoadingAssessments(false)
  }, [selectedClassId, selectedSubjectId, selectedTermId])

  const loadMarks = useCallback(async () => {
    if (!selectedAssessmentId) return
    setLoadingMarks(true)
    const result = await getAssessmentMarks(selectedAssessmentId)
    if (!result.success) {
      toast.error('Failed to load marks', { description: result.error.message })
      setStudents([])
      setMarkState({})
      setLoadingMarks(false)
      return
    }

    setStudents(result.students)
    setMaxScore(Number(result.assessment.max_score ?? 100))

    const nextState: MarkState = {}
    result.marks.forEach((m) => {
      nextState[m.student_id] = String(m.score)
    })
    setMarkState(nextState)
    setLoadingMarks(false)
  }, [selectedAssessmentId])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    void loadAssessments()
    setStudents([])
    setMarkState({})
  }, [loadAssessments])

  useEffect(() => {
    void loadMarks()
  }, [loadMarks])

  const canLoad = !!selectedTermId && !!selectedClassId && !!selectedSubjectId && !!selectedAssessmentId

  const studentsCount = students.length
  const filledCount = useMemo(
    () => Object.values(markState).filter((v) => v.trim() !== '').length,
    [markState]
  )

  const handleSave = async () => {
    if (!selectedAssessmentId) return

    const entries = Object.entries(markState)
      .map(([student_id, scoreStr]) => ({ student_id, score: Number(scoreStr) }))
      .filter((e) => e.student_id && Number.isFinite(e.score))

    if (entries.length === 0) {
      toast.error('No marks to save')
      return
    }

    setSaving(true)
    const result = await upsertStudentMarksBulk(selectedAssessmentId, entries)
    if (!result.success) {
      toast.error('Save failed', { description: result.error.message })
      setSaving(false)
      return
    }

    toast.success('Marks saved')
    setSaving(false)
    await loadMarks()
  }

  const classLabel = useMemo(() => classes.find((c) => c.id === selectedClassId)?.name ?? '', [classes, selectedClassId])
  const subjectLabel = useMemo(() => {
    const s = subjects.find((x) => x.id === selectedSubjectId)
    return s ? `${s.code} - ${s.name}` : ''
  }, [subjects, selectedSubjectId])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Term</Label>
            <Select value={selectedTermId} onValueChange={setSelectedTermId} disabled={loadingLookups}>
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.year} Term {t.term} {t.is_current ? '(Current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={loadingLookups}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId} disabled={loadingLookups}>
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assessment</Label>
            <Select
              value={selectedAssessmentId}
              onValueChange={setSelectedAssessmentId}
              disabled={!selectedClassId || !selectedSubjectId || loadingAssessments}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingAssessments ? 'Loading...' : 'Select assessment'} />
              </SelectTrigger>
              <SelectContent>
                {assessments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {classLabel && subjectLabel ? (
              <>
                <span className="font-medium text-foreground">{classLabel}</span>
                <span className="mx-2">/</span>
                <span className="font-medium text-foreground">{subjectLabel}</span>
                <span className="mx-2">/</span>
                <span>Max score: {maxScore}</span>
                <span className="mx-2">/</span>
                <span>
                  Filled: {filledCount}/{studentsCount}
                </span>
              </>
            ) : (
              'Select term, class, subject, and assessment.'
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadMarks()} disabled={!canLoad || loadingMarks || saving}>
              {loadingMarks ? 'Loading...' : 'Reload'}
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canLoad || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {!canLoad ? null : loadingMarks ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading marks...
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">
            No enrolled students found for this subject. Configure Subject Selection first.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adm</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="w-40">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const value = markState[s.id] ?? ''
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm text-muted-foreground">{s.admission_number}</TableCell>
                    <TableCell className="font-medium">
                      {s.first_name} {s.last_name}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => {
                          const next = e.target.value
                          setMarkState((p) => ({ ...p, [s.id]: next }))
                        }}
                        placeholder={`0-${maxScore}`}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
