'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { applyKerichoRecommendedSeniorSubjects } from '@/lib/actions/subjects'
import {
  autoAssignCompulsorySubjects,
  bulkAssignSubjectToClass,
  bulkRemoveSubjectFromClass,
  copySubjectSelectionsFromClass,
  getSubjectSelectionSetup,
  importSubjectSelectionsCsv,
  saveClassSubjectSelections,
} from '@/lib/actions/subject-selection'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']

type Rules = {
  min_total_subjects: number
  max_total_subjects: number
  min_sciences: number
  max_humanities: number
  ranking_method: 'BEST_N' | 'ALL_TAKEN'
  ranking_n: number
}

export function SubjectSelectionManager({ canManage }: { canManage: boolean }) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [copySourceClassId, setCopySourceClassId] = useState('')
  const [bulkSubjectId, setBulkSubjectId] = useState('')
  const [csvText, setCsvText] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState('')

  const [students, setStudents] = useState<
    Array<{ id: string; admission_number: string; first_name: string; last_name: string }>
  >([])
  const [subjects, setSubjects] = useState<
    Array<{ id: string; code: string; name: string; curriculum_area: string | null; is_compulsory: boolean }>
  >([])
  const [compulsorySubjectIds, setCompulsorySubjectIds] = useState<string[]>([])
  const [selectionState, setSelectionState] = useState<Record<string, string[]>>({})
  const [rules, setRules] = useState<Rules | null>(null)

  const compulsorySet = useMemo(() => new Set(compulsorySubjectIds), [compulsorySubjectIds])

  const loadLookups = useCallback(async () => {
    setLoading(true)
    const [termsResult, classesResult] = await Promise.all([getAcademicTerms(), getClasses({ includeInactive: false })])

    if (!termsResult.success) {
      toast.error('Failed to load terms', { description: termsResult.error.message })
      setLoading(false)
      return
    }

    if (!classesResult.success) {
      toast.error('Failed to load classes', { description: classesResult.error.message })
      setLoading(false)
      return
    }

    setTerms(termsResult.terms)
    setClasses(classesResult.classes.filter((c) => c.grade_level >= 10 && c.grade_level <= 12))

    const current = termsResult.terms.find((term) => term.is_current)
    const defaultTerm = current?.id ?? termsResult.terms[0]?.id ?? ''
    setSelectedTermId((prev) => prev || defaultTerm)

    setLoading(false)
  }, [])

  const loadSetup = useCallback(async () => {
    if (!selectedTermId || !selectedClassId) {
      setStudents([])
      setSubjects([])
      setCompulsorySubjectIds([])
      setSelectionState({})
      return
    }

    setLoading(true)
    const result = await getSubjectSelectionSetup({ termId: selectedTermId, classId: selectedClassId })
    if (!result.success) {
      toast.error('Failed to load subject selection', { description: result.error.message })
      setLoading(false)
      return
    }

    setStudents(result.students)
    setSubjects(result.subjects)
    setCompulsorySubjectIds(result.compulsorySubjectIds)
    setRules((result.rules as Rules | null) ?? null)
    setBulkSubjectId((prev) => prev || result.subjects[0]?.id || '')

    const byStudent: Record<string, string[]> = {}
    for (const student of result.students) byStudent[student.id] = []
    for (const enrollment of result.enrollments) {
      const list = byStudent[enrollment.student_id] ?? []
      if (!list.includes(enrollment.subject_id)) list.push(enrollment.subject_id)
      byStudent[enrollment.student_id] = list
    }
    for (const student of result.students) {
      const list = byStudent[student.id] ?? []
      for (const compulsoryId of result.compulsorySubjectIds) {
        if (!list.includes(compulsoryId)) list.push(compulsoryId)
      }
      byStudent[student.id] = list
    }
    setSelectionState(byStudent)
    setLoading(false)
  }, [selectedClassId, selectedTermId])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    void loadSetup()
  }, [loadSetup])

  const handleToggle = (studentId: string, subjectId: string, checked: boolean) => {
    setSelectionState((prev) => {
      const current = new Set(prev[studentId] ?? [])
      if (checked) current.add(subjectId)
      else current.delete(subjectId)
      return { ...prev, [studentId]: Array.from(current) }
    })
  }

  const handleSave = async () => {
    if (!selectedTermId || !selectedClassId || !canManage) return
    setSaving(true)
    const payload = students.map((student) => ({
      studentId: student.id,
      subjectIds: (selectionState[student.id] ?? []).filter((subjectId) => !compulsorySet.has(subjectId)),
    }))
    const result = await saveClassSubjectSelections({
      termId: selectedTermId,
      classId: selectedClassId,
      selections: payload,
    })
    if (!result.success) {
      toast.error('Save failed', { description: result.error.message })
      setSaving(false)
      return
    }
    toast.success('Subject selections saved')
    setSaving(false)
    await loadSetup()
  }

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key)
    try {
      await fn()
    } finally {
      setBusyAction('')
    }
  }

  const minSubjects = rules?.min_total_subjects ?? 7
  const maxSubjects = rules?.max_total_subjects ?? 9

  const countsByStudent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const student of students) counts.set(student.id, (selectionState[student.id] ?? []).length)
    return counts
  }, [selectionState, students])

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
        Only School Admin can manage subject selections.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Term</Label>
            <Select value={selectedTermId} onValueChange={setSelectedTermId}>
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.year} Term {term.term} {term.is_current ? '(Current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Rules</Label>
            <div className="h-10 rounded-md border border-border/60 bg-background px-3 text-sm flex items-center text-muted-foreground">
              Min {minSubjects} / Max {maxSubjects} subjects
            </div>
          </div>

          <div className="flex items-end justify-start lg:justify-end">
            <Button
              variant="outline"
              onClick={() =>
                void runBusy('profile', async () => {
                  const result = await applyKerichoRecommendedSeniorSubjects()
                  if (!result.success) {
                    toast.error('Profile apply failed', { description: result.error.message })
                    return
                  }
                  toast.success('Kericho profile applied')
                  await loadSetup()
                })
              }
              disabled={busyAction !== '' || !selectedClassId || !selectedTermId}
            >
              {busyAction === 'profile' ? 'Applying...' : 'Apply Kericho 16-subject profile'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!selectedClassId || !selectedTermId || busyAction !== ''}
            onClick={() =>
              void runBusy('compulsory', async () => {
                const result = await autoAssignCompulsorySubjects({ termId: selectedTermId, classId: selectedClassId })
                if (!result.success) {
                  toast.error('Compulsory assignment failed', { description: result.error.message })
                  return
                }
                toast.success('Compulsory subjects assigned')
                await loadSetup()
              })
            }
          >
            {busyAction === 'compulsory' ? 'Applying...' : 'Assign compulsory to all'}
          </Button>

          <Select value={bulkSubjectId} onValueChange={setBulkSubjectId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.code} - {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={!bulkSubjectId || !selectedClassId || !selectedTermId || busyAction !== ''}
            onClick={() =>
              void runBusy('bulk-add', async () => {
                const result = await bulkAssignSubjectToClass({
                  termId: selectedTermId,
                  classId: selectedClassId,
                  subjectId: bulkSubjectId,
                })
                if (!result.success) {
                  toast.error('Bulk assign failed', { description: result.error.message })
                  return
                }
                toast.success('Subject assigned to class')
                await loadSetup()
              })
            }
          >
            {busyAction === 'bulk-add' ? 'Assigning...' : 'Bulk assign'}
          </Button>

          <Button
            variant="outline"
            disabled={!bulkSubjectId || !selectedClassId || !selectedTermId || busyAction !== ''}
            onClick={() =>
              void runBusy('bulk-remove', async () => {
                const result = await bulkRemoveSubjectFromClass({
                  termId: selectedTermId,
                  classId: selectedClassId,
                  subjectId: bulkSubjectId,
                })
                if (!result.success) {
                  toast.error('Bulk remove failed', { description: result.error.message })
                  return
                }
                toast.success('Subject removed from class')
                await loadSetup()
              })
            }
          >
            {busyAction === 'bulk-remove' ? 'Removing...' : 'Bulk remove'}
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[260px_1fr_auto]">
          <Select value={copySourceClassId} onValueChange={setCopySourceClassId}>
            <SelectTrigger>
              <SelectValue placeholder="Copy electives from class" />
            </SelectTrigger>
            <SelectContent>
              {classes
                .filter((row) => row.id !== selectedClassId)
                .map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Textarea
            rows={3}
            placeholder="CSV import: admission_no,BIO,CHEM,PHY,GEO,BUS"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={!copySourceClassId || !selectedClassId || !selectedTermId || busyAction !== ''}
              onClick={() =>
                void runBusy('copy', async () => {
                  const result = await copySubjectSelectionsFromClass({
                    termId: selectedTermId,
                    sourceClassId: copySourceClassId,
                    targetClassId: selectedClassId,
                  })
                  if (!result.success) {
                    toast.error('Copy failed', { description: result.error.message })
                    return
                  }
                  toast.success(`Copied ${result.copiedSubjects} elective subjects`)
                  await loadSetup()
                })
              }
            >
              {busyAction === 'copy' ? 'Copying...' : 'Copy from class'}
            </Button>
            <Button
              variant="outline"
              disabled={!csvText.trim() || !selectedClassId || !selectedTermId || busyAction !== ''}
              onClick={() =>
                void runBusy('csv', async () => {
                  const result = await importSubjectSelectionsCsv({
                    termId: selectedTermId,
                    classId: selectedClassId,
                    csvText,
                  })
                  if (!result.success) {
                    toast.error('CSV import failed', { description: result.error.message })
                    return
                  }
                  toast.success(`CSV imported (${result.rows} rows)`)
                  setCsvText('')
                  await loadSetup()
                })
              }
            >
              {busyAction === 'csv' ? 'Importing...' : 'Import CSV'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading subject selection...
        </div>
      ) : !selectedClassId || !selectedTermId ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-10 text-center text-muted-foreground">
          Select term and class to manage subject selections.
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-10 text-center text-muted-foreground">
          No students found in this class and term.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Students: {students.length}</Badge>
              <Badge variant="outline">Subjects: {subjects.length}</Badge>
              <Badge variant="outline">Compulsory: {compulsorySubjectIds.length}</Badge>
            </div>
            <Button onClick={() => void handleSave()} disabled={saving || busyAction !== ''}>
              {saving ? 'Saving...' : 'Save selections'}
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/80 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="sticky left-0 bg-card z-20 px-3 py-2 text-left">Student</th>
                  <th className="sticky left-[220px] bg-card z-20 px-3 py-2 text-left">Count</th>
                  {subjects.map((subject) => (
                    <th key={subject.id} className="px-3 py-2 text-left" title={subject.name}>
                      <div className="font-semibold">{subject.code}</div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{subject.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const selected = new Set(selectionState[student.id] ?? [])
                  const count = countsByStudent.get(student.id) ?? 0
                  const tooFew = count < minSubjects
                  const tooMany = count > maxSubjects

                  return (
                    <tr key={student.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="sticky left-0 bg-card px-3 py-2 align-middle min-w-[220px]">
                        <div className="font-medium">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{student.admission_number}</div>
                      </td>
                      <td className="sticky left-[220px] bg-card px-3 py-2 align-middle min-w-[96px]">
                        <Badge variant={tooFew || tooMany ? 'destructive' : 'secondary'}>
                          {count}
                        </Badge>
                      </td>
                      {subjects.map((subject) => {
                        const isCompulsory = compulsorySet.has(subject.id)
                        const checked = selected.has(subject.id) || isCompulsory
                        return (
                          <td key={subject.id} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={checked}
                              disabled={isCompulsory}
                              onCheckedChange={(value) => handleToggle(student.id, subject.id, value === true)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground">
            Compulsory subjects are locked and always included. Recommended load: {minSubjects}-{maxSubjects} subjects.
          </div>
        </div>
      )}
    </div>
  )
}
