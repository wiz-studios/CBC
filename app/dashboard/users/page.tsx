import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { UsersManager } from '@/components/users/users-manager'
import { AuditLogTable } from '@/components/users/audit-log-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const metadata = {
  title: 'Users - CBC Academic System',
}

export default async function UsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth')

  const allowed = ['SUPER_ADMIN', 'SCHOOL_ADMIN']
  if (!allowed.includes(user.role)) redirect('/dashboard')

  const scope = user.role as 'SUPER_ADMIN' | 'SCHOOL_ADMIN'

  const [rolesResult, permsResult] = await Promise.all([
    admin.from('roles').select('id, name, description, is_system_role').eq('is_system_role', true).order('name'),
    admin.from('permissions').select('id, name, resource, action').order('resource').order('action'),
  ])

  const roles = (rolesResult.data ?? []) as any[]
  const permissions = (permsResult.data ?? []) as any[]

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Access</p>
            <h1 className="mt-2 text-4xl font-display font-semibold">Users & Roles</h1>
            <p className="mt-2 text-muted-foreground">Manage staff, access levels, and audit activity.</p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {scope === 'SUPER_ADMIN'
                  ? 'Platform-wide view (all schools)'
                  : 'School-scoped view (your school only)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsersManager scope={scope} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>System Roles</CardTitle>
                <CardDescription>Fixed role definitions used by the platform</CardDescription>
              </CardHeader>
              <CardContent>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles found.</p>
                ) : (
                  <div className="space-y-3">
                    {roles.map((r) => (
                      <div key={r.id} className="rounded-xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{r.name}</div>
                          <Badge variant="outline">system</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{r.description || '-'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
                <CardDescription>Permission catalog (read-only)</CardDescription>
              </CardHeader>
              <CardContent>
                {permissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No permissions found.</p>
                ) : (
                  <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissions.slice(0, 75).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-muted-foreground">{p.resource}</TableCell>
                            <TableCell className="text-muted-foreground">{p.action}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {permissions.length > 75 ? (
                  <p className="text-xs text-muted-foreground mt-2">Showing first 75 permissions.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
              <CardDescription>
                {scope === 'SUPER_ADMIN' ? 'Across all schools' : 'Your school only'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogTable showSchool={scope === 'SUPER_ADMIN'} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
