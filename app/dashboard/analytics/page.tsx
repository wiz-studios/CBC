import { Activity, Building2, ShieldCheck, Users2 } from 'lucide-react'

import { AuthGuard } from '@/components/auth-guard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { admin } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Analytics - CBC Academic System',
}

type AuditRow = {
  id: string
  school_id: string
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  created_at: string
}

export default async function AnalyticsPage() {
  const [
    { count: totalSchools },
    { count: activeSchools },
    { count: suspendedSchools },
    { count: totalUsers },
    { count: activeUsers },
    auditResult,
  ] = await Promise.all([
    admin.from('schools').select('id', { count: 'exact', head: true }).neq('code', 'PLATFORM'),
    admin.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('code', 'PLATFORM'),
    admin.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', false).neq('code', 'PLATFORM'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    admin
      .from('audit_logs')
      .select('id, school_id, user_id, action, resource_type, resource_id, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
  ])

  const auditRows = (auditResult.data ?? []) as AuditRow[]

  const schoolIds = Array.from(new Set(auditRows.map((r) => r.school_id).filter(Boolean)))
  const userIds = Array.from(new Set(auditRows.map((r) => r.user_id).filter(Boolean))) as string[]

  const [schoolsResult, usersResult] = await Promise.all([
    schoolIds.length
      ? admin.from('schools').select('id, name, code').in('id', schoolIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? admin.from('users').select('id, email, first_name, last_name').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const schoolById = new Map<string, { name: string; code: string }>()
  ;(schoolsResult.data ?? []).forEach((s: any) => {
    schoolById.set(s.id, { name: s.name, code: s.code })
  })

  const userById = new Map<string, { email: string; name: string }>()
  ;(usersResult.data ?? []).forEach((u: any) => {
    userById.set(u.id, { email: u.email, name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() })
  })

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-8">
        <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Platform</p>
              <h1 className="mt-2 text-4xl font-display font-semibold">Analytics</h1>
              <p className="mt-2 text-muted-foreground">Usage and audit activity across all schools.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Schools" value={totalSchools ?? 0} sub="All tenants" icon={Building2} />
          <MetricCard label="Active Schools" value={activeSchools ?? 0} sub="Not suspended" icon={ShieldCheck} />
          <MetricCard label="Suspended" value={suspendedSchools ?? 0} sub="Access blocked" icon={Activity} />
          <MetricCard label="Total Users" value={totalUsers ?? 0} sub="All users" icon={Users2} />
          <MetricCard label="Active Users" value={activeUsers ?? 0} sub="Status = ACTIVE" icon={Users2} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest audit log entries across schools</CardDescription>
          </CardHeader>
          <CardContent>
            {auditRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-10 text-center text-muted-foreground">
                No audit activity yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditRows.map((row) => {
                      const school = schoolById.get(row.school_id)
                      const actor = row.user_id ? userById.get(row.user_id) : null

                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(row.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">{school?.name ?? row.school_id}</span>
                              <span className="text-xs text-muted-foreground">{school?.code ?? ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {actor ? (
                              <div className="flex flex-col">
                                <span className="font-medium">{actor.email}</span>
                                <span className="text-xs text-muted-foreground">{actor.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant="outline">{row.action}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.resource_type}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: number
  sub: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/70 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
