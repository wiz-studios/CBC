'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { getSubjects } from '@/lib/actions/subjects'
import { getTeachers, type TeacherWithUser } from '@/lib/actions/teachers'
import { createAssessment, deleteAssessment, getAssessmentTypes, getAssessments } from '@/lib/actions/marks'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2 } from 'lucide-react'

type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type AssessmentRow = Database['public']['Tables']['assessments']['Row']
type AssessmentTypeRow = Database['public']['Tables']['assessment_types']['Row']

type CreateAssessmentForm = {
  academic_term_id: string
  class_id: string
  subject_id: string
  assessment_type_id: string
  title: string
  assessment_date: string
  max_score: string
  teacher_id: string
}

export function AssessmentsManager({
  role,
}: {
  role: 'SCHOOL_ADMIN' | 'HEAD_TEACHER' | 'TEACHER'
}) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentTypeRow[]>([])
  const [teachers, setTeachersList] = useState<TeacherWithUser[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [filterClassId, setFilterClassId] = useState('all')
  const [filterSubjectId, setFilterSubjectId] = useState('all')

  const [rows, setRows] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<CreateAssessmentForm>({
    academic_term_id: '',
    class_id: '',
    subject_id: '',
    assessment_type_id: '',
    title: '',
    assessment_date: '',
    max_score: '',
    teacher_id: '',
  })

  const [deleteTarget, setDeleteTarget] = useState<AssessmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canCreate = role === 'TEACHER' || role === 'HEAD_TEACHER'
  const canDelete = role === 'SCHOOL_ADMIN'
  const canPickTeacher = role === 'HEAD_TEACHER'

  const loadLookups = useCallback(async () => {
    const [termsResult, classesResult, subjectsResult, typesResult, teachersResult] = await Promise.all([
      getAcademicTerms(),
      getClasses({ includeInactive: false }),
      getSubjects(),
      getAssessmentTypes(),
      canPickTeacher ? getTeachers() : Promise.resolve({ success: true, teachers: [] } as any),
    ])

    if (termsResult.success) {
      setTerms(termsResult.terms)
      const current = termsResult.terms.find((t) => t.is_current)
      setSelectedTermId((current?.id as string) || (termsResult.terms[0]?.id as string) || '')
    } else {
      toast.error('Failed to load terms', { description: termsResult.error.message })
    }

    if (classesResult.success) setClasses(classesResult.classes)
    else toast.error('Failed to load classes', { description: classesResult.error.message })

    if (subjectsResult.success) setSubjects(subjectsResult.subjects)
    else toast.error('Failed to load subjects', { description: subjectsResult.error.message })

    if (typesResult.success) setAssessmentTypes(typesResult.assessmentTypes)
    else toast.error('Failed to load assessment types', { description: typesResult.error.message })

    if (teachersResult.success) setTeachersList(teachersResult.teachers ?? [])
    else toast.error('Failed to load teachers', { description: teachersResult.error.message })
  }, [canPickTeacher])

  const loadAssessments = useCallback(async () => {
    if (!selectedTermId) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await getAssessments({
      academicTermId: selectedTermId,
      classId: filterClassId === 'all' ? undefined : filterClassId,
      subjectId: filterSubjectId === 'all' ? undefined : filterSubjectId,
    })

    if (!result.success) {
      toast.error('Failed to load assessments', { description: result.error.message })
      setRows([])
      setLoading(false)
      return
    }

    setRows(result.assessments)
    setLoading(false)
  }, [filterClassId, filterSubjectId, selectedTermId])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    void loadAssessments()
  }, [loadAssessments])

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const typeById = useMemo(() => new Map(assessmentTypes.map((t) => [t.id, t])), [assessmentTypes])

  const openCreate = () => {
    if (!selectedTermId) {
      toast.error('Select a term first')
      return
    }

    setCreateForm({
      academic_term_id: selectedTermId,
      class_id: filterClassId === 'all' ? '' : filterClassId,
      subject_id: filterSubjectId === 'all' ? '' : filterSubjectId,
      assessment_type_id: '',
      title: '',
      assessment_date: '',
      max_score: '',
      teacher_id: '',
    })
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    const title = createForm.title.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }
    if (!createForm.academic_term_id || !createForm.class_id || !createForm.subject_id || !createForm.assessment_type_id) {
      toast.error('Please select term, class, subject, and type')
      return
    }

    const maxScore = createForm.max_score.trim() ? Number(createForm.max_score) : null
    if (maxScore != null && (!Number.isFinite(maxScore) || maxScore <= 0)) {
      toast.error('Max score must be a positive number')
      return
    }

    setCreating(true)
    const result = await createAssessment({
      academic_term_id: createForm.academic_term_id,
      class_id: createForm.class_id,
      subject_id: createForm.subject_id,
      assessment_type_id: createForm.assessment_type_id,
      title,
      assessment_date: createForm.assessment_date || null,
      max_score: maxScore,
      teacher_id: canPickTeacher ? (createForm.teacher_id || null) : null,
    })

    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Assessment created')
    setCreating(false)
    setCreateOpen(false)
    await loadAssessments()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteAssessment(deleteTarget.id)
    if (!result.success) {
      toast.error('Delete failed', { description: result.error.message })
      setDeleting(false)
      return
    }
    toast.success('Assessment deleted')
    setDeleting(false)
    setDeleteTarget(null)
    await loadAssessments()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
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
              <Select value={filterClassId} onValueChange={setFilterClassId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
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
              <Select value={filterSubjectId} onValueChange={setFilterSubjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {canCreate ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Assessment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create assessment</DialogTitle>
                <DialogDescription>Create a new assessment for mark entry.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={createForm.class_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, class_id: v }))}>
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
                <Select value={createForm.subject_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, subject_id: v }))}>
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
                <Label>Type</Label>
                <Select
                  value={createForm.assessment_type_id}
                  onValueChange={(v) => {
                    const suggestedMax = typeById.get(v)?.max_score ?? 100
                    setCreateForm((p) => ({ ...p, assessment_type_id: v, max_score: String(suggestedMax) }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {assessmentTypes.filter((t) => t.is_active).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} (w={t.weight})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canPickTeacher ? (
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={createForm.teacher_id} onValueChange={(v) => setCreateForm((p) => ({ ...p, teacher_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.user ? `${t.user.first_name} ${t.user.last_name}` : t.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div />
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assessment-title">Title</Label>
                <Input
                  id="assessment-title"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assessment-date">Date (optional)</Label>
                <Input
                  id="assessment-date"
                  type="date"
                  value={createForm.assessment_date}
                  onChange={(e) => setCreateForm((p) => ({ ...p, assessment_date: e.target.value }))}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assessment-max">Max score</Label>
                <Input
                  id="assessment-max"
                  inputMode="numeric"
                  value={createForm.max_score}
                  onChange={(e) => setCreateForm((p) => ({ ...p, max_score: e.target.value }))}
                  disabled={creating}
                />
              </div>
            </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreate()} disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          ) : (
            <div className="text-sm text-muted-foreground">
              Assessments are created by teachers or head teachers.
            </div>
          )}
      </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No assessments found for the selected filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Max</TableHead>
                {canDelete ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{classById.get(row.class_id)?.name ?? row.class_id}</TableCell>
                  <TableCell>
                    {subjectById.get(row.subject_id)
                      ? `${subjectById.get(row.subject_id)!.code} - ${subjectById.get(row.subject_id)!.name}`
                      : row.subject_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeById.get(row.assessment_type_id)?.name ?? 'Type'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.assessment_date ?? '-'}</TableCell>
                  <TableCell>{row.max_score}</TableCell>
                  {canDelete ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteTarget(row)}
                        aria-label="Delete assessment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          {deleteTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete assessment</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the assessment and its marks. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
