'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getClassStudents } from '@/lib/actions/classes'
import { getMyLessonsForDate, submitLessonAttendance, upsertLessonAttendanceBulk, getLessonSessionAttendance } from '@/lib/actions/attendance'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckSquare, Eye, Save } from 'lucide-react'

type StudentRow = Database['public']['Tables']['students']['Row']

type LessonRow = {
  id: string
  lesson_date: string
  class_id: string
  subject_id: string
  session_status: string
  locked_at: string | null
  classes?: { name: string; grade_level: number } | null
  subjects?: { name: string; code: string } | null
}

type AttendanceStatus = 'PRESENT' | 'ABSENT'

export function AttendanceManager({ canMark }: { canMark: boolean }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [lessons, setLessons] = useState<LessonRow[]>([])

  const [openLesson, setOpenLesson] = useState<LessonRow | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [statusByStudentId, setStatusByStudentId] = useState<Record<string, AttendanceStatus>>({})

  const [saving, setSaving] = useState(false)

  const loadLessons = useCallback(async () => {
    setLoading(true)
    const result = await getMyLessonsForDate(date)
    if (!result.success) {
      toast.error('Failed to load lessons', { description: result.error.message })
      setLessons([])
      setLoading(false)
      return
    }
    setLessons((result.lessons ?? []) as any)
    setLoading(false)
  }, [date])

  useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  const isLockedOrSubmitted = useMemo(() => {
    if (!openLesson) return false
    return openLesson.session_status === 'LOCKED' || openLesson.session_status === 'SUBMITTED' || !!openLesson.locked_at
  }, [openLesson])

  const openAttendance = async (lesson: LessonRow) => {
    setOpenLesson(lesson)
    setRosterLoading(true)
    setStudents([])
    setStatusByStudentId({})

    try {
      const [roster, existing] = await Promise.all([
        getClassStudents(lesson.class_id),
        getLessonSessionAttendance(lesson.id),
      ])

      const rosterRows = (roster ?? []) as StudentRow[]
      const existingRows = (existing ?? []) as any[]

      const map: Record<string, AttendanceStatus> = {}
      for (const s of rosterRows) map[s.id] = 'PRESENT'
      for (const r of existingRows) {
        if (r?.student_id && (r.status === 'PRESENT' || r.status === 'ABSENT')) {
          map[r.student_id] = r.status
        }
      }

      setStudents(rosterRows)
      setStatusByStudentId(map)
    } catch (e: any) {
      toast.error('Failed to load attendance', { description: e?.message || 'Unknown error' })
    } finally {
      setRosterLoading(false)
    }
  }

  const toggleAbsent = (studentId: string) => {
    setStatusByStudentId((prev) => {
      const next = { ...prev }
      next[studentId] = prev[studentId] === 'ABSENT' ? 'PRESENT' : 'ABSENT'
      return next
    })
  }

  const saveAttendance = async (submitAfterSave: boolean) => {
    if (!openLesson) return
    setSaving(true)
    try {
      const payload = students.map((s) => ({
        student_id: s.id,
        status: statusByStudentId[s.id] ?? 'PRESENT',
      }))

      const upsert = await upsertLessonAttendanceBulk(openLesson.id, payload)
      if (!upsert.success) {
        toast.error('Save failed', { description: upsert.error.message })
        return
      }

      if (submitAfterSave) {
        const submit = await submitLessonAttendance(openLesson.id)
        if (!submit.success) {
          toast.error('Submit failed', { description: submit.error.message })
          return
        }
        toast.success('Attendance submitted')
      } else {
        toast.success('Attendance saved')
      }

      setOpenLesson(null)
      await loadLessons()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Lesson date</div>
            <div className="space-y-2">
              <Label htmlFor="attendance-date">Date</Label>
              <Input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadLessons()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
            {loading ? 'Loading sessions...' : `Sessions: ${lessons.length}`}
          </span>
          <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1">
            {canMark ? 'Marking enabled' : 'View-only access'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading lessons...
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">
            No lesson sessions found for this date. If you have a timetable, ask an admin to generate sessions.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.classes?.name ?? l.class_id}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.subjects ? `${l.subjects.code} - ${l.subjects.name}` : l.subject_id}
                  </TableCell>
                  <TableCell>
                    {l.session_status === 'LOCKED' ? (
                      <Badge variant="secondary">Locked</Badge>
                    ) : l.session_status === 'SUBMITTED' ? (
                      <Badge className="bg-emerald-600">Submitted</Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openAttendance(l)}
                      className="gap-2"
                    >
                      {canMark ? <CheckSquare className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {canMark ? 'Mark' : 'View'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!openLesson} onOpenChange={(open) => !open && setOpenLesson(null)}>
        <DialogContent className="max-w-3xl">
          {openLesson ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {openLesson.classes?.name ?? 'Lesson'} - {openLesson.subjects?.code ?? ''}{' '}
                  {openLesson.subjects?.name ?? ''}
                </DialogTitle>
                <DialogDescription>
                  {openLesson.lesson_date} - Status: {openLesson.session_status}
                </DialogDescription>
              </DialogHeader>

              {rosterLoading ? (
                <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
                  Loading class roster...
                </div>
              ) : students.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-10 text-center">
                  <p className="text-muted-foreground">No students found for this class.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Admission</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s) => {
                        const status = statusByStudentId[s.id] ?? 'PRESENT'
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              {s.first_name} {s.last_name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{s.admission_number}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant={status === 'ABSENT' ? 'destructive' : 'outline'}
                                size="sm"
                                onClick={() => toggleAbsent(s.id)}
                                disabled={!canMark || saving || isLockedOrSubmitted}
                              >
                                {status}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenLesson(null)} disabled={saving}>
                  Close
                </Button>
                {canMark ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void saveAttendance(false)}
                      disabled={saving || rosterLoading || isLockedOrSubmitted}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      onClick={() => void saveAttendance(true)}
                      disabled={saving || rosterLoading || isLockedOrSubmitted}
                    >
                      {saving ? 'Submitting...' : 'Submit'}
                    </Button>
                  </>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
