'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteSchool,
  getSchools,
  setSchoolActive,
  updateSchool,
  type SchoolWithStatus,
} from '@/lib/actions/schools'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { toast } from 'sonner'
import { Ban, CheckCircle, Edit, Eye, RefreshCw, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type StatusFilter = 'all' | 'active' | 'suspended'

type EditFormState = {
  name: string
  school_type: 'PRIMARY' | 'SECONDARY' | 'BOTH'
  motto: string
  principal_name: string
  principal_email: string
  phone: string
  address: string
  county: string
  sub_county: string
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function formatRelative(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return formatDistanceToNow(date, { addSuffix: true })
}

export function SchoolsList() {
  const [schools, setSchools] = useState<SchoolWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const [viewSchool, setViewSchool] = useState<SchoolWithStatus | null>(null)

  const [editSchoolItem, setEditSchoolItem] = useState<SchoolWithStatus | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [suspendSchool, setSuspendSchool] = useState<SchoolWithStatus | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendSaving, setSuspendSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SchoolWithStatus | null>(null)
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const loadSchools = useCallback(async () => {
    setLoading(true)

    const result = await getSchools({
      query: query.trim() || undefined,
      status,
    })

    if (!result.success) {
      setSchools([])
      toast.error('Failed to load schools', { description: result.error.message })
      setLoading(false)
      return
    }

    setSchools(result.schools)
    setLoading(false)
  }, [query, status])

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSchools()
    }, 250)
    return () => clearTimeout(handle)
  }, [query, status, loadSchools])

  const emptyState = useMemo(() => !loading && schools.length === 0, [loading, schools.length])

  const openEdit = (school: SchoolWithStatus) => {
    setEditSchoolItem(school)
    setEditForm({
      name: school.name ?? '',
      school_type: school.school_type,
      motto: school.motto ?? '',
      principal_name: school.principal_name ?? '',
      principal_email: school.principal_email ?? '',
      phone: school.phone ?? '',
      address: school.address ?? '',
      county: school.county ?? '',
      sub_county: school.sub_county ?? '',
    })
  }

  const saveEdit = async () => {
    if (!editSchoolItem || !editForm) return
    setEditSaving(true)

    const result = await updateSchool(editSchoolItem.id, {
      name: editForm.name,
      school_type: editForm.school_type,
      motto: editForm.motto || null,
      principal_name: editForm.principal_name || null,
      principal_email: editForm.principal_email || null,
      phone: editForm.phone || null,
      address: editForm.address || null,
      county: editForm.county || null,
      sub_county: editForm.sub_county || null,
    })

    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setEditSaving(false)
      return
    }

    toast.success('School updated')
    setSchools((prev) => prev.map((s) => (s.id === editSchoolItem.id ? { ...s, ...result.school } : s)))
    setEditSaving(false)
    setEditSchoolItem(null)
    setEditForm(null)
  }

  const openSuspend = (school: SchoolWithStatus) => {
    setSuspendSchool(school)
    setSuspendReason('')
  }

  const performSuspend = async () => {
    if (!suspendSchool) return
    setSuspendSaving(true)

    const nextActive = !suspendSchool.is_active
    const result = await setSchoolActive(suspendSchool.id, nextActive, suspendReason.trim() || undefined)

    if (!result.success) {
      toast.error('Action failed', { description: result.error.message })
      setSuspendSaving(false)
      return
    }

    toast.success(nextActive ? 'School reactivated' : 'School suspended')
    setSchools((prev) => prev.map((s) => (s.id === suspendSchool.id ? { ...s, ...result.school } : s)))
    setSuspendSaving(false)
    setSuspendSchool(null)
    setSuspendReason('')
  }

  const openDelete = (school: SchoolWithStatus) => {
    setDeleteTarget(school)
    setDeleteConfirmCode('')
    setDeleteReason('')
  }

  const performDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)

    const result = await deleteSchool(deleteTarget.id, deleteConfirmCode, deleteReason.trim() || undefined)

    if (!result.success) {
      toast.error('Delete failed', { description: result.error.message })
      setDeleting(false)
      return
    }

    toast.success('School deleted (access disabled)')
    setSchools((prev) => prev.filter((s) => s.id !== deleteTarget.id))
    setDeleting(false)
    setDeleteTarget(null)
    setDeleteConfirmCode('')
    setDeleteReason('')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Label>Search</Label>
              <Input
                placeholder="Search schools (name, code, county)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="w-full lg:w-44">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="outline" onClick={() => void loadSchools()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{schools.length} schools</Badge>
            {status !== 'all' ? <Badge variant="outline">Status: {status}</Badge> : null}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading schools...
        </div>
      ) : emptyState ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-sm text-muted-foreground">No schools found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>County</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active Users</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Current Term</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map((school) => (
                <TableRow key={school.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{school.name}</span>
                      <span className="text-xs text-muted-foreground">{school.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>{school.county || '-'}</TableCell>
                  <TableCell>
                    {school.is_active ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Suspended</Badge>
                    )}
                  </TableCell>
                  <TableCell>{school.active_users_count}</TableCell>
                  <TableCell>{school.last_activity_at ? formatRelative(school.last_activity_at) : '-'}</TableCell>
                  <TableCell>
                    {school.current_term ? `${school.current_term.year} T${school.current_term.term}` : '-'}
                  </TableCell>
                  <TableCell>{formatDate(school.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setViewSchool(school)} aria-label="View school">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(school)} aria-label="Edit school">
                        <Edit className="h-4 w-4" />
                      </Button>
                      {school.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSuspend(school)}
                          aria-label="Suspend school"
                          className="text-amber-700 hover:text-amber-800"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSuspend(school)}
                          aria-label="Reactivate school"
                          className="text-green-700 hover:text-green-800"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDelete(school)}
                        aria-label="Delete school"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!viewSchool} onOpenChange={(open) => !open && setViewSchool(null)}>
        <DialogContent className="max-w-2xl">
          {viewSchool ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewSchool.name}</DialogTitle>
                <DialogDescription>School details and status</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">Code</p>
                  <p className="text-sm text-muted-foreground">{viewSchool.code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Type</p>
                  <p className="text-sm text-muted-foreground">{viewSchool.school_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="text-sm text-muted-foreground">{viewSchool.is_active ? 'Active' : 'Suspended'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">{formatDate(viewSchool.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Active users</p>
                  <p className="text-sm text-muted-foreground">{viewSchool.active_users_count}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Last activity</p>
                  <p className="text-sm text-muted-foreground">
                    {viewSchool.last_activity_at ? formatDate(viewSchool.last_activity_at) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Current term</p>
                  <p className="text-sm text-muted-foreground">
                    {viewSchool.current_term ? `${viewSchool.current_term.year} T${viewSchool.current_term.term}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">County</p>
                  <p className="text-sm text-muted-foreground">{viewSchool.county || '-'}</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewSchool(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    openEdit(viewSchool)
                    setViewSchool(null)
                  }}
                >
                  Edit
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editSchoolItem}
        onOpenChange={(open) => {
          if (!open) {
            setEditSchoolItem(null)
            setEditForm(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {editSchoolItem && editForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit school</DialogTitle>
                <DialogDescription>Update the school profile (tenant metadata only).</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-name">School name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label>School type</Label>
                  <Select
                    value={editForm.school_type}
                    onValueChange={(v) =>
                      setEditForm((p) => (p ? { ...p, school_type: v as EditFormState['school_type'] } : p))
                    }
                    disabled={editSaving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRIMARY">PRIMARY</SelectItem>
                      <SelectItem value="SECONDARY">SECONDARY</SelectItem>
                      <SelectItem value="BOTH">BOTH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-county">County</Label>
                  <Input
                    id="edit-county"
                    value={editForm.county}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, county: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-subcounty">Sub-county</Label>
                  <Input
                    id="edit-subcounty"
                    value={editForm.sub_county}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, sub_county: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-principal">Principal name</Label>
                  <Input
                    id="edit-principal"
                    value={editForm.principal_name}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, principal_name: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-principal-email">Principal email</Label>
                  <Input
                    id="edit-principal-email"
                    type="email"
                    value={editForm.principal_email}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, principal_email: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, phone: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    value={editForm.address}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, address: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-motto">Motto</Label>
                  <Input
                    id="edit-motto"
                    value={editForm.motto}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, motto: e.target.value } : p))}
                    disabled={editSaving}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditSchoolItem(null)
                    setEditForm(null)
                  }}
                  disabled={editSaving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void saveEdit()} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!suspendSchool}
        onOpenChange={(open) => {
          if (!open) setSuspendSchool(null)
        }}
      >
        <AlertDialogContent>
          {suspendSchool ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{suspendSchool.is_active ? 'Suspend school' : 'Reactivate school'}</AlertDialogTitle>
                <AlertDialogDescription>
                  {suspendSchool.is_active
                    ? 'Suspending will block this school from accessing the platform.'
                    : 'Reactivating will restore access for this school.'}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2">
                <Label htmlFor="suspend-reason">Reason (recommended)</Label>
                <Input
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="e.g., non-payment, abuse, requested pause"
                  disabled={suspendSaving}
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={suspendSaving}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void performSuspend()} disabled={suspendSaving}>
                  {suspendSaving ? 'Working...' : suspendSchool.is_active ? 'Suspend' : 'Reactivate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          {deleteTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete school</AlertDialogTitle>
                <AlertDialogDescription>
                  This disables access and marks the tenant deleted. Type the school code to confirm: <b>{deleteTarget.code}</b>
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">Confirmation code</Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmCode}
                    onChange={(e) => setDeleteConfirmCode(e.target.value)}
                    placeholder={deleteTarget.code}
                    disabled={deleting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-reason">Reason (optional)</Label>
                  <Input
                    id="delete-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Why are you deleting this school?"
                    disabled={deleting}
                  />
                </div>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void performDelete()}
                  disabled={
                    deleting || deleteConfirmCode.trim().toUpperCase() !== String(deleteTarget.code).trim().toUpperCase()
                  }
                  className="bg-red-600 hover:bg-red-600/90"
                >
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
