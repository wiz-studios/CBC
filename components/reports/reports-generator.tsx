'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getAcademicTerms } from '@/lib/actions/terms'
import { getClasses } from '@/lib/actions/classes'
import { generateReportCardsForClass } from '@/lib/actions/reports'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

export function ReportsGenerator({ canGenerate }: { canGenerate: boolean }) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])

  const [selectedTermId, setSelectedTermId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

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

  useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  const handleGenerate = async () => {
    if (!selectedTermId || !selectedClassId) {
      toast.error('Select term and class')
      return
    }

    setGenerating(true)
    const result = await generateReportCardsForClass({
      academicTermId: selectedTermId,
      classId: selectedClassId,
    })

    if (!result.success) {
      toast.error('Generation failed', { description: result.error.message })
      setGenerating(false)
      return
    }

    toast.success(`Generated ${result.created} report drafts`)
    setGenerating(false)
    setConfirmOpen(false)
  }

  if (!canGenerate) {
    return <div className="text-sm text-muted-foreground">Only School Admin / Head Teacher can generate reports.</div>
  }

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

          <div className="flex items-end justify-start lg:justify-end">
            <Button onClick={() => setConfirmOpen(true)} disabled={!selectedTermId || !selectedClassId}>
              Generate drafts
            </Button>
          </div>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          Drafts are created from the current marks and attendance snapshots. Re-generating creates a new version.
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate report drafts</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new report version for every student in the selected class.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? 'Generating...' : 'Generate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
