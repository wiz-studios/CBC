'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { getSubjects } from '@/lib/actions/subjects'
import { getAssessmentPerformance, type AssessmentPerformanceRow } from '@/lib/actions/marks'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'


type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']

export function PerformanceSummary() {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  const [rows, setRows] = useState<AssessmentPerformanceRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadLookups = useCallback(async () => {
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
  }, [])

  const loadPerformance = useCallback(async () => {
    if (!selectedTermId || !selectedClassId || !selectedSubjectId) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await getAssessmentPerformance({
      academicTermId: selectedTermId,
      classId: selectedClassId,
      subjectId: selectedSubjectId,
    })

    if (!result.success) {
      toast.error('Failed to load performance', { description: result.error.message })
      setRows([])
      setLoading(false)
      return
    }

    setRows(result.rows)
    setLoading(false)
  }, [selectedTermId, selectedClassId, selectedSubjectId])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    void loadPerformance()
  }, [loadPerformance])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Term</Label>
            <Select value={selectedTermId} onValueChange={setSelectedTermId}>
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
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
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
            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
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
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading performance...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No performance data for the selected filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Avg</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.average}</Badge>
                  </TableCell>
                  <TableCell>{row.max_score}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
