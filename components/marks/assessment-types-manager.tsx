'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { createAssessmentType, getAssessmentTypes, updateAssessmentType } from '@/lib/actions/marks'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Edit, Plus } from 'lucide-react'

type AssessmentTypeRow = Database['public']['Tables']['assessment_types']['Row']

type CreateFormState = {
  name: string
  weight: string
  max_score: string
}

type EditFormState = {
  name: string
  weight: string
  max_score: string
  is_active: boolean
}

export function AssessmentTypesManager({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<AssessmentTypeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>({ name: '', weight: '10', max_score: '100' })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<AssessmentTypeRow | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAssessmentTypes()
    if (!result.success) {
      toast.error('Failed to load assessment types', { description: result.error.message })
      setRows([])
      setLoading(false)
      return
    }
    setRows(result.assessmentTypes)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeCount = useMemo(() => rows.filter((r) => r.is_active).length, [rows])

  const handleCreate = async () => {
    const name = createForm.name.trim()
    const weight = Number(createForm.weight)
    const maxScore = createForm.max_score.trim() ? Number(createForm.max_score) : null

    if (!name) {
      toast.error('Name is required')
      return
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error('Weight must be a positive number')
      return
    }

    if (maxScore != null && (!Number.isFinite(maxScore) || maxScore <= 0)) {
      toast.error('Max score must be a positive number')
      return
    }

    setCreating(true)
    const result = await createAssessmentType({ name, weight, max_score: maxScore })
    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Assessment type created')
    setCreating(false)
    setCreateOpen(false)
    setCreateForm({ name: '', weight: '10', max_score: '100' })
    await load()
  }

  const openEdit = (row: AssessmentTypeRow) => {
    setEditTarget(row)
    setEditForm({
      name: row.name,
      weight: String(row.weight),
      max_score: row.max_score == null ? '' : String(row.max_score),
      is_active: row.is_active,
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editTarget || !editForm) return

    const name = editForm.name.trim()
    const weight = Number(editForm.weight)
    const maxScore = editForm.max_score.trim() ? Number(editForm.max_score) : null

    if (!name) {
      toast.error('Name is required')
      return
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error('Weight must be a positive number')
      return
    }

    if (maxScore != null && (!Number.isFinite(maxScore) || maxScore <= 0)) {
      toast.error('Max score must be a positive number')
      return
    }

    setEditing(true)
    const result = await updateAssessmentType(editTarget.id, { name, weight, max_score: maxScore, is_active: editForm.is_active })
    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setEditing(false)
      return
    }

    toast.success('Assessment type updated')
    setEditing(false)
    setEditOpen(false)
    setEditTarget(null)
    setEditForm(null)
    await load()
  }

  if (!canManage) {
    return (
      <div className="text-sm text-muted-foreground">
        Only School Admin can manage assessment types.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Assessment Types</h3>
            <p className="text-sm text-muted-foreground">
              {activeCount} active of {rows.length} total
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Type
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create assessment type</DialogTitle>
                <DialogDescription>Define a reusable assessment type (CAT, Exam, etc.).</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type-name">Name</Label>
                  <Input
                    id="type-name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    disabled={creating}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type-weight">Weight</Label>
                    <Input
                      id="type-weight"
                      inputMode="decimal"
                      value={createForm.weight}
                      onChange={(e) => setCreateForm((p) => ({ ...p, weight: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type-max">Max score</Label>
                    <Input
                      id="type-max"
                      inputMode="numeric"
                      value={createForm.max_score}
                      onChange={(e) => setCreateForm((p) => ({ ...p, max_score: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
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
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No assessment types yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.weight}</TableCell>
                  <TableCell>{row.max_score ?? 100}</TableCell>
                  <TableCell>
                    {row.is_active ? <Badge className="bg-emerald-600">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="Edit assessment type">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditOpen(false)
            setEditTarget(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {editTarget && editForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit assessment type</DialogTitle>
                <DialogDescription>Update type details.</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-type-name">Name</Label>
                  <Input
                    id="edit-type-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))}
                    disabled={editing}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-type-weight">Weight</Label>
                    <Input
                      id="edit-type-weight"
                      inputMode="decimal"
                      value={editForm.weight}
                      onChange={(e) => setEditForm((p) => (p ? { ...p, weight: e.target.value } : p))}
                      disabled={editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-type-max">Max score</Label>
                    <Input
                      id="edit-type-max"
                      inputMode="numeric"
                      value={editForm.max_score}
                      onChange={(e) => setEditForm((p) => (p ? { ...p, max_score: e.target.value } : p))}
                      disabled={editing}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="edit-type-active"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, is_active: e.target.checked } : p))}
                    disabled={editing}
                  />
                  <Label htmlFor="edit-type-active">Active</Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editing}>
                  Cancel
                </Button>
                <Button onClick={() => void handleEdit()} disabled={editing}>
                  {editing ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
