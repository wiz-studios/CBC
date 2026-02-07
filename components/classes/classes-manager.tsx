'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { createClass, deleteClass, getClasses, updateClass } from '@/lib/actions/classes'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Edit, Plus, Trash2 } from 'lucide-react'

type ClassRow = Database['public']['Tables']['classes']['Row']

type CreateFormState = {
  name: string
  grade_level: number
  stream: string
  capacity: string
}

type EditFormState = {
  name: string
  capacity: string
  is_active: boolean
}

const GRADE_LEVELS = [7, 8, 9, 10, 11, 12]

export function ClassesManager({ canManage }: { canManage: boolean }) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    grade_level: 7,
    stream: '',
    capacity: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState<ClassRow | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)

  const [archiveTarget, setArchiveTarget] = useState<ClassRow | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getClasses({ includeInactive: canManage })
    if (!result.success) {
      toast.error('Failed to load classes', { description: result.error.message })
      setClasses([])
      setLoading(false)
      return
    }

    setClasses(result.classes)
    setLoading(false)
  }, [canManage])

  useEffect(() => {
    void load()
  }, [load])

  const activeCount = useMemo(() => classes.filter((c) => c.is_active).length, [classes])

  const handleCreate = async () => {
    const name = createForm.name.trim()
    if (!name) {
      toast.error('Class name is required')
      return
    }

    setCreating(true)
    const capacityNumber = createForm.capacity.trim() ? Number(createForm.capacity) : null
    const result = await createClass({
      name,
      grade_level: createForm.grade_level,
      stream: createForm.stream.trim() || null,
      capacity: Number.isFinite(capacityNumber as any) ? (capacityNumber as number) : null,
    })

    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('Class created')
    setCreateOpen(false)
    setCreateForm({ name: '', grade_level: 7, stream: '', capacity: '' })
    setCreating(false)
    await load()
  }

  const openEdit = (row: ClassRow) => {
    setEditTarget(row)
    setEditForm({
      name: row.name,
      capacity: row.capacity != null ? String(row.capacity) : '',
      is_active: row.is_active,
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editTarget || !editForm) return
    const name = editForm.name.trim()
    if (!name) {
      toast.error('Class name is required')
      return
    }

    setEditing(true)
    const capacityNumber = editForm.capacity.trim() ? Number(editForm.capacity) : null
    const result = await updateClass(editTarget.id, {
      name,
      capacity: Number.isFinite(capacityNumber as any) ? (capacityNumber as number) : null,
      is_active: editForm.is_active,
    })

    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setEditing(false)
      return
    }

    toast.success('Class updated')
    setEditing(false)
    setEditOpen(false)
    setEditTarget(null)
    setEditForm(null)
    await load()
  }

  const handleArchive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    const result = await deleteClass(archiveTarget.id)
    if (!result.success) {
      toast.error('Archive failed', { description: result.error.message })
      setArchiving(false)
      return
    }

    toast.success('Class archived')
    setArchiving(false)
    setArchiveTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {activeCount} active {activeCount === 1 ? 'class' : 'classes'}
          </div>

          {canManage ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add class
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create class</DialogTitle>
                  <DialogDescription>Add a new class/stream for your school.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 lg:grid-cols-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="class-name">Class name</Label>
                    <Input
                      id="class-name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Grade 7 East"
                      disabled={creating}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="grade-level">Grade level</Label>
                    <select
                      id="grade-level"
                      className="h-11 w-full rounded-xl border border-input/60 bg-background/70 px-3 py-2 text-sm shadow-sm"
                      value={createForm.grade_level}
                      onChange={(e) => setCreateForm((p) => ({ ...p, grade_level: Number(e.target.value) }))}
                      disabled={creating}
                    >
                      {GRADE_LEVELS.map((g) => (
                        <option key={g} value={g}>
                          Grade {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="stream">Stream (optional)</Label>
                    <Input
                      id="stream"
                      value={createForm.stream}
                      onChange={(e) => setCreateForm((p) => ({ ...p, stream: e.target.value }))}
                      placeholder="e.g., A"
                      disabled={creating}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="capacity">Capacity (optional)</Label>
                    <Input
                      id="capacity"
                      inputMode="numeric"
                      value={createForm.capacity}
                      onChange={(e) => setCreateForm((p) => ({ ...p, capacity: e.target.value }))}
                      placeholder="e.g., 45"
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
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading classes...
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No classes found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Stream</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.grade_level}</TableCell>
                  <TableCell className="text-muted-foreground">{row.stream || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{row.capacity ?? '-'}</TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="Edit class">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {row.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setArchiveTarget(row)}
                            aria-label="Archive class"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void updateClass(row.id, { is_active: true }).then(() => load())}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
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
        <DialogContent className="max-w-2xl">
          {editTarget && editForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit class</DialogTitle>
                <DialogDescription>Update class details.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-class-name">Class name</Label>
                  <Input
                    id="edit-class-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))}
                    disabled={editing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-capacity">Capacity</Label>
                  <Input
                    id="edit-capacity"
                    inputMode="numeric"
                    value={editForm.capacity}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, capacity: e.target.value } : p))}
                    disabled={editing}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-active"
                    checked={editForm.is_active}
                    onCheckedChange={(value) => setEditForm((p) => (p ? { ...p, is_active: value === true } : p))}
                    disabled={editing}
                  />
                  <Label htmlFor="edit-active">Active</Label>
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

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          {archiveTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive class</AlertDialogTitle>
                <AlertDialogDescription>
                  This will hide the class from most lists, but keep historical records. You can reactivate later.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleArchive()} disabled={archiving}>
                  {archiving ? 'Archiving...' : 'Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
