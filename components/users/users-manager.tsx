'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { createUser, getUsers, setUserStatus, setUserSuperAdmin, type UserWithAccess } from '@/lib/actions/users'
import { getSchools } from '@/lib/actions/schools'

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, Shield, ShieldOff, Plus } from 'lucide-react'

type UserStatus = Database['public']['Tables']['users']['Row']['status'] | 'all'

export function UsersManager({ scope }: { scope: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' }) {
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<UserStatus>('all')
  const [users, setUsers] = useState<UserWithAccess[]>([])
  const [workingUserId, setWorkingUserId] = useState<string | null>(null)
  const [schools, setSchools] = useState<Array<{ id: string; name: string; code: string }>>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: scope === 'SUPER_ADMIN' ? 'SCHOOL_ADMIN' : 'TEACHER',
    school_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getUsers({
      query: query.trim() || undefined,
      status,
    })
    if (!result.success) {
      toast.error('Failed to load users', { description: result.error.message })
      setUsers([])
      setLoading(false)
      return
    }
    setUsers(result.users)
    setLoading(false)
  }, [query, status])

  useEffect(() => {
    const handle = setTimeout(() => void load(), 250)
    return () => clearTimeout(handle)
  }, [load])

  const loadSchools = useCallback(async () => {
    const result = await getSchools({ status: 'all' })
    if (!result.success) {
      toast.error('Failed to load schools', { description: result.error.message })
      return
    }
    setSchools(result.schools.map((s) => ({ id: s.id, name: s.name, code: s.code })))
  }, [])

  useEffect(() => {
    if (scope !== 'SUPER_ADMIN') return
    void loadSchools()
  }, [scope, loadSchools])

  const empty = useMemo(() => !loading && users.length === 0, [loading, users.length])

  const updateStatus = async (userId: string, next: Database['public']['Tables']['users']['Row']['status']) => {
    setWorkingUserId(userId)
    const result = await setUserStatus(userId, next)
    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setWorkingUserId(null)
      return
    }
    toast.success('User updated')
    setWorkingUserId(null)
    await load()
  }

  const toggleSuperAdmin = async (userId: string, make: boolean) => {
    setWorkingUserId(userId)
    const result = await setUserSuperAdmin(userId, make)
    if (!result.success) {
      toast.error('Role update failed', { description: result.error.message })
      setWorkingUserId(null)
      return
    }
    toast.success(make ? 'Granted SUPER_ADMIN' : 'Revoked SUPER_ADMIN')
    setWorkingUserId(null)
    await load()
  }

  const handleCreate = async () => {
    const first_name = createForm.first_name.trim()
    const last_name = createForm.last_name.trim()
    const email = createForm.email.trim()
    const password = createForm.password
    const role = createForm.role as any
    const school_id = scope === 'SUPER_ADMIN' ? createForm.school_id : undefined

    if (!first_name || !last_name || !email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    if (scope === 'SUPER_ADMIN' && !school_id) {
      toast.error('Select a school')
      return
    }

    setCreating(true)
    const result = await createUser({
      first_name,
      last_name,
      email,
      password,
      role,
      school_id,
    })

    if (!result.success) {
      toast.error('Create failed', { description: result.error.message })
      setCreating(false)
      return
    }

    toast.success('User created')
    setCreating(false)
    setCreateOpen(false)
    setCreateForm({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      role: scope === 'SUPER_ADMIN' ? 'SCHOOL_ADMIN' : 'TEACHER',
      school_id: '',
    })
    await load()
  }

  const currentUserId = users.find((u) => u.role === 'SUPER_ADMIN')?.id

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Label>Search</Label>
              <Input
                placeholder="Search by name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="w-full lg:w-44">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open)
              if (open && scope === 'SUPER_ADMIN' && schools.length === 0) {
                void loadSchools()
              }
            }}
          >
            <div className="flex items-center gap-2">
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              {scope === 'SUPER_ADMIN' ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground"
                        aria-label="Super admin role restrictions"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {schools.length === 0
                        ? 'Create a school first, then add a School Admin.'
                        : 'Super admin can only create School Admin users.'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>Create a staff account and assign role.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
                <div className="space-y-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Profile</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="create-first-name">First name</Label>
                      <Input
                        id="create-first-name"
                        value={createForm.first_name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, first_name: e.target.value }))}
                        disabled={creating}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-last-name">Last name</Label>
                      <Input
                        id="create-last-name"
                        value={createForm.last_name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, last_name: e.target.value }))}
                        disabled={creating}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="create-email">Email</Label>
                      <Input
                        id="create-email"
                        type="email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                        disabled={creating}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-password">Temporary password</Label>
                      <Input
                        id="create-password"
                        type="password"
                        value={createForm.password}
                        onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                        disabled={creating}
                      />
                      <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Access</div>

                  {scope === 'SUPER_ADMIN' ? (
                    <div className="space-y-2">
                      <Label>School</Label>
                      <Select
                        value={createForm.school_id}
                        onValueChange={(v) => setCreateForm((p) => ({ ...p, school_id: v }))}
                        disabled={schools.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={schools.length === 0 ? 'No schools yet' : 'Select school'} />
                        </SelectTrigger>
                        <SelectContent>
                          {schools.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {schools.length === 0 ? (
                        <Button variant="outline" size="sm" onClick={() => void loadSchools()}>
                          Refresh schools
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={createForm.role}
                      onValueChange={(v) => setCreateForm((p) => ({ ...p, role: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scope === 'SUPER_ADMIN' ? (
                          <SelectItem value="SCHOOL_ADMIN">SCHOOL_ADMIN</SelectItem>
                        ) : (
                          <>
                            <SelectItem value="SCHOOL_ADMIN">SCHOOL_ADMIN</SelectItem>
                            <SelectItem value="HEAD_TEACHER">HEAD_TEACHER</SelectItem>
                            <SelectItem value="TEACHER">TEACHER</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreate()} disabled={creating || (scope === 'SUPER_ADMIN' && schools.length === 0)}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{users.length} users</Badge>
            <span className="text-muted-foreground">
              {scope === 'SUPER_ADMIN' ? 'Platform-wide access' : 'School scope'}
            </span>
            {status !== 'all' ? <Badge variant="outline">Status: {status}</Badge> : null}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading users...
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-sm text-muted-foreground">No users found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                {scope === 'SUPER_ADMIN' ? <TableHead>School</TableHead> : null}
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const busy = workingUserId === u.id
                const isSelf = scope === 'SUPER_ADMIN' && u.id === currentUserId
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>
                          {u.first_name} {u.last_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>

                    {scope === 'SUPER_ADMIN' ? (
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{u.school?.name ?? u.school_id}</span>
                          <span className="text-xs text-muted-foreground">{u.school?.code ?? ''}</span>
                        </div>
                      </TableCell>
                    ) : null}

                    <TableCell>
                      <Badge variant="outline">{u.role}</Badge>
                    </TableCell>

                    <TableCell>
                      {u.status === 'ACTIVE' ? (
                        <Badge className="bg-emerald-600">ACTIVE</Badge>
                      ) : u.status === 'SUSPENDED' ? (
                        <Badge variant="secondary">SUSPENDED</Badge>
                      ) : (
                        <Badge variant="outline">INACTIVE</Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : '-'}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {scope === 'SUPER_ADMIN' ? (
                          u.role === 'SUPER_ADMIN' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleSuperAdmin(u.id, false)}
                              disabled={busy || isSelf}
                              className="gap-2"
                            >
                              <ShieldOff className="h-4 w-4" />
                              {isSelf ? 'You' : 'Revoke'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleSuperAdmin(u.id, true)}
                              disabled={busy}
                              className="gap-2"
                            >
                              <Shield className="h-4 w-4" />
                              Make Super
                            </Button>
                          )
                        ) : (
                          <Select
                            value={u.status}
                            onValueChange={(v) => void updateStatus(u.id, v as any)}
                            disabled={busy}
                          >
                            <SelectTrigger className="h-9 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                              <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                              <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
