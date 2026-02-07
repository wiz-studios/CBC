'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { getReportCards, publishReportCard, publishReportCardsBulk, type ReportCardWithStudent } from '@/lib/actions/reports'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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


type TermRow = Database['public']['Tables']['academic_terms']['Row']
type ClassRow = Database['public']['Tables']['classes']['Row']

type StatusFilter = 'ALL' | 'DRAFT' | 'RELEASED'

export function ReportCardsTable({
  canPublish,
  defaultStatus = 'ALL',
  showBulkPublish = false,
}: {
  canPublish: boolean
  defaultStatus?: StatusFilter
  showBulkPublish?: boolean
}) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [status, setStatus] = useState<StatusFilter>(defaultStatus)

  const [rows, setRows] = useState<ReportCardWithStudent[]>([])
  const [loading, setLoading] = useState(true)

  const [publishTarget, setPublishTarget] = useState<ReportCardWithStudent | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [bulkPublishing, setBulkPublishing] = useState(false)

  const loadLookups = useCallback(async () => {
    const [termsResult, classesResult] = await Promise.all([
      getAcademicTerms(),
      getClasses({ includeInactive: false }),
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
  }, [])

  const loadReports = useCallback(async () => {
    if (!selectedTermId || !selectedClassId) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    const result = await getReportCards({
      academicTermId: selectedTermId,
      classId: selectedClassId,
      status: status === 'ALL' ? undefined : status,
    })

    if (!result.success) {
      toast.error('Failed to load report cards', { description: result.error.message })
      setRows([])
      setLoading(false)
      return
    }

    setRows(result.reports)
    setLoading(false)
  }, [selectedClassId, selectedTermId, status])

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const handlePublish = async () => {
    if (!publishTarget) return
    setPublishing(true)
    const result = await publishReportCard(publishTarget.report.id)
    if (!result.success) {
      toast.error('Publish failed', { description: result.error.message })
      setPublishing(false)
      return
    }
    toast.success('Report published')
    setPublishing(false)
    setPublishTarget(null)
    await loadReports()
  }

  const handlePublishAll = async () => {
    if (!selectedTermId || !selectedClassId) return
    setBulkPublishing(true)
    const result = await publishReportCardsBulk({ academicTermId: selectedTermId, classId: selectedClassId })
    if (!result.success) {
      toast.error('Publish failed', { description: result.error.message })
      setBulkPublishing(false)
      return
    }
    toast.success(`Published ${result.updated} reports`)
    setBulkPublishing(false)
    await loadReports()
  }

  const summary = useMemo(() => {
    const drafts = rows.filter((r) => r.report.status === 'DRAFT').length
    const released = rows.filter((r) => r.report.status === 'RELEASED').length
    return { drafts, released }
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
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
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="RELEASED">Released</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            {showBulkPublish && canPublish ? (
              <Button onClick={() => void handlePublishAll()} disabled={bulkPublishing || !selectedTermId || !selectedClassId}>
                {bulkPublishing ? 'Publishing...' : `Publish Drafts (${summary.drafts})`}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading report cards...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No report cards for the selected filters.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Mean Pts</TableHead>
                <TableHead>Avg %</TableHead>
                <TableHead>Class Pos</TableHead>
                <TableHead>Stream Pos</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Generated</TableHead>
                {canPublish ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.report.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.student.first_name} {row.student.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.student.admission_number}</div>
                  </TableCell>
                  <TableCell>v{row.report.version_number}</TableCell>
                  <TableCell>
                    {row.report.status === 'RELEASED' ? (
                      <Badge className="bg-emerald-600">Released</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.report.overall_grade ?? '-'}</TableCell>
                  <TableCell>{row.report.mean_points ?? '-'}</TableCell>
                  <TableCell>{row.report.average_percentage ?? 0}</TableCell>
                  <TableCell>{row.report.position_in_class ?? '-'}</TableCell>
                  <TableCell>{row.report.position_in_stream ?? '-'}</TableCell>
                  <TableCell>{row.report.total_marks ?? 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.report.generated_at).toLocaleString()}
                  </TableCell>
                  {canPublish ? (
                    <TableCell className="text-right">
                      {row.report.status === 'DRAFT' ? (
                        <Button variant="outline" size="sm" onClick={() => setPublishTarget(row)}>
                          Publish
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Published</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!publishTarget} onOpenChange={(open) => !open && setPublishTarget(null)}>
        <AlertDialogContent>
          {publishTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish report</AlertDialogTitle>
                <AlertDialogDescription>
                  This will release the report card and lock it for viewing. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handlePublish()} disabled={publishing}>
                  {publishing ? 'Publishing...' : 'Publish'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
