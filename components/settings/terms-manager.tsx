'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { createAcademicTerm, getAcademicTerms, setCurrentTerm } from '@/lib/actions/terms'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Plus } from 'lucide-react'

type TermRow = Database['public']['Tables']['academic_terms']['Row']

type CreateFormState = {
  year: string
  term: '1' | '2' | '3'
  term_name: string
  start_date: string
  end_date: string
  is_current: boolean
}

export function TermsManager({ canManage }: { canManage: boolean }) {
  const [terms, setTerms] = useState<TermRow[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateFormState>({
    year: String(new Date().getFullYear()),
    term: '1',
    term_name: '',
    start_date: '',
    end_date: '',
    is_current: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAcademicTerms()
    if (!result.success) {
      toast.error('Failed to load terms', { description: result.error.message })
      setTerms([])
      setLoading(false)
      return
    }
    setTerms(result.terms)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const currentTerm = useMemo(() => terms.find((t) => t.is_current), [terms])

  const handleCreate = async () => {
    const year = Number(form.year)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      toast.error('Invalid year')
      return
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Start and end date are required')
      return
    }

    setCreating(true)
    const result = await createAcademicTerm({
      year,
      term: Number(form.term) as 1 | 2 | 3,
      term_name: form.term_name.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      is_current: form.is_current,
    })

    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Academic term created')
    setCreating(false)
    setCreateOpen(false)
    await load()
  }

  const handleSetCurrent = async (term: TermRow) => {
    const result = await setCurrentTerm(term.school_id, term.id)
    if (!result.success) {
      toast.error('Failed to set current term', { description: result.error.message })
      return
    }
    toast.success('Current term updated')
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Current term:{' '}
          <span className="font-medium text-foreground">
            {currentTerm ? `${currentTerm.year} T${currentTerm.term}` : 'Not set'}
          </span>
        </div>

        {canManage ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add term
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create academic term</DialogTitle>
                <DialogDescription>Define the term calendar for your school.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="term-year">Year</Label>
                    <Input
                      id="term-year"
                      inputMode="numeric"
                      value={form.year}
                      onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="term-number">Term</Label>
                    <select
                      id="term-number"
                      className="h-10 w-full rounded-lg border border-input/70 bg-background/70 px-3 py-2 text-sm shadow-sm"
                      value={form.term}
                      onChange={(e) => setForm((p) => ({ ...p, term: e.target.value as CreateFormState['term'] }))}
                      disabled={creating}
                    >
                      <option value="1">Term 1</option>
                      <option value="2">Term 2</option>
                      <option value="3">Term 3</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="term-name">Term name (optional)</Label>
                  <Input
                    id="term-name"
                    value={form.term_name}
                    onChange={(e) => setForm((p) => ({ ...p, term_name: e.target.value }))}
                    placeholder="e.g., Term 1 2026"
                    disabled={creating}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-date">End date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="is-current"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.is_current}
                    onChange={(e) => setForm((p) => ({ ...p, is_current: e.target.checked }))}
                    disabled={creating}
                  />
                  <Label htmlFor="is-current">Set as current term</Label>
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
        ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading terms...
        </div>
      ) : terms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No academic terms found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.year}</TableCell>
                  <TableCell>{t.term}</TableCell>
                  <TableCell className="text-muted-foreground">{t.term_name || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.start_date}</TableCell>
                  <TableCell className="text-muted-foreground">{t.end_date}</TableCell>
                  <TableCell>
                    {t.is_current ? <Badge className="bg-emerald-600">Current</Badge> : <Badge variant="outline">-</Badge>}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {!t.is_current ? (
                        <Button variant="outline" size="sm" onClick={() => void handleSetCurrent(t)}>
                          Set current
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
