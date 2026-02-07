import { formatDistanceToNow } from 'date-fns'
import { Activity, BookOpen, Building2, CheckCircle2, Clock, Users2 } from 'lucide-react'

import { getCurrentUser } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Dashboard - CBC Academic System',
  description: 'Welcome to CBC Academic Administration System',
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) return null

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const today = new Date().toISOString().split('T')[0]

  let stat1Value: string | number = '-'
  let stat1Sub = ''
  let stat2Value: string | number = '-'
  let stat2Sub = ''
  let stat3Value: string | number = '-'
  let stat3Sub = ''
  let stat4Value: string | number = '-'
  let stat4Sub = ''

  let totalSchools: number | null = null

  try {
    if (isSuperAdmin) {
      const [{ count: schoolsCount }, { count: activeSchoolsCount }, { count: usersCount }] = await Promise.all([
        admin.from('schools').select('id', { count: 'exact', head: true }).neq('code', 'PLATFORM'),
        admin.from('schools').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('code', 'PLATFORM'),
        admin.from('users').select('id', { count: 'exact', head: true }),
      ])

      totalSchools = schoolsCount ?? 0

      stat1Value = schoolsCount ?? 0
      stat1Sub = 'schools in the platform'

      stat2Value = usersCount ?? 0
      stat2Sub = 'all users'

      stat3Value = activeSchoolsCount ?? 0
      stat3Sub = 'active (not suspended)'

      const { data: lastUser } = await admin
        .from('users')
        .select('last_login')
        .not('last_login', 'is', null)
        .order('last_login', { ascending: false })
        .limit(1)
        .maybeSingle()

      stat4Value = lastUser?.last_login
        ? formatDistanceToNow(new Date(lastUser.last_login), { addSuffix: true })
        : '-'
      stat4Sub = 'last user login'
    } else {
      const supabase = await createClient()

      const [{ count: activeClassesCount }, { count: studentsCount }, { count: teachersCount }] = await Promise.all([
        supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', user.school_id)
          .eq('is_active', true),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', user.school_id),
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', user.school_id),
      ])

      stat1Value = activeClassesCount ?? 0
      stat1Sub = 'active classes'

      stat2Value = studentsCount ?? 0
      stat2Sub = 'students'

      stat3Value = teachersCount ?? 0
      stat3Sub = 'teachers'

      if (user.role === 'TEACHER') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .eq('school_id', user.school_id)
          .maybeSingle()

        const teacherId = (teacher as any)?.id as string | undefined
        if (teacherId) {
          const [{ count: totalLessons }, { count: submittedLessons }] = await Promise.all([
            supabase
              .from('lesson_sessions')
              .select('id', { count: 'exact', head: true })
              .eq('teacher_id', teacherId)
              .eq('lesson_date', today),
            supabase
              .from('lesson_sessions')
              .select('id', { count: 'exact', head: true })
              .eq('teacher_id', teacherId)
              .eq('lesson_date', today)
              .not('submitted_at', 'is', null),
          ])

          stat4Value = submittedLessons ?? 0
          stat4Sub = `submitted / ${totalLessons ?? 0} lessons`
        } else {
          stat4Value = 0
          stat4Sub = 'no teacher profile found'
        }
      } else {
        const { data: term } = await supabase
          .from('academic_terms')
          .select('id')
          .eq('school_id', user.school_id)
          .eq('is_current', true)
          .maybeSingle()

        const termId = (term as any)?.id as string | undefined
        if (termId) {
          const [{ count: totalLessons }, { count: submittedLessons }] = await Promise.all([
            supabase
              .from('lesson_sessions')
              .select('id', { count: 'exact', head: true })
              .eq('academic_term_id', termId)
              .eq('lesson_date', today),
            supabase
              .from('lesson_sessions')
              .select('id', { count: 'exact', head: true })
              .eq('academic_term_id', termId)
              .eq('lesson_date', today)
              .not('submitted_at', 'is', null),
          ])

          stat4Value = submittedLessons ?? 0
          stat4Sub = `submitted / ${totalLessons ?? 0} lessons`
        } else {
          stat4Value = 0
          stat4Sub = 'no current term set'
        }
      }
    }
  } catch {
    // Avoid breaking the dashboard if analytics queries fail.
  }

  const databaseStatus = 'Ready'
  const schoolsStatus = isSuperAdmin ? ((totalSchools ?? 0) > 0 ? 'Configured' : 'Pending') : 'Configured'
  const moduleStatus = isSuperAdmin ? 'Available' : 'Pending'

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dashboard</p>
            <h1 className="mt-2 text-4xl font-display font-semibold">
              Welcome back, {user.first_name}.
            </h1>
            <p className="mt-2 text-muted-foreground">
              {isSuperAdmin
                ? 'Platform overview across all schools'
                : 'CBC Academic Administration System - Kenyan Competency-Based Curriculum'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{user.role.replace('_', ' ')}</Badge>
            <Badge variant="outline">Status: {user.status}</Badge>
            {isSuperAdmin ? <Badge variant="outline">Tenants: {totalSchools ?? 0}</Badge> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isSuperAdmin ? 'Total Schools' : 'Active Classes'}
          value={stat1Value}
          sub={stat1Sub}
          icon={Building2}
        />
        <StatCard
          label={isSuperAdmin ? 'Total Users' : 'Students'}
          value={stat2Value}
          sub={stat2Sub}
          icon={Users2}
        />
        <StatCard
          label={isSuperAdmin ? 'Active Schools' : 'Teachers'}
          value={stat3Value}
          sub={stat3Sub}
          icon={BookOpen}
        />
        <StatCard
          label={isSuperAdmin ? 'Recent Activity' : 'Attendance Today'}
          value={stat4Value}
          sub={stat4Sub}
          icon={Clock}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current configuration and health checks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusRow label="User Account" value="Active" icon={CheckCircle2} />
            <StatusRow label="Database" value={databaseStatus} icon={Activity} />
            <StatusRow label={isSuperAdmin ? 'Schools' : 'School Setup'} value={schoolsStatus} icon={Building2} />
            <StatusRow label={isSuperAdmin ? 'Analytics' : 'Timetable'} value={moduleStatus} icon={Clock} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Recommended setup sequence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              'Run database migrations (see DATABASE_SETUP.md)',
              isSuperAdmin
                ? 'Create (or approve) the first school'
                : 'Create school information in Admin Settings',
              isSuperAdmin
                ? 'Create a SCHOOL_ADMIN user for that school'
                : 'Set up academic terms and classes',
              isSuperAdmin
                ? 'Review platform analytics (adoption + activity)'
                : 'Add teachers and students',
              isSuperAdmin ? 'Configure system settings and security' : 'Create timetables',
            ].map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {index + 1}
                </div>
                <div className="text-muted-foreground">{step}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Your Account</CardTitle>
          <CardDescription>Profile details for this session</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-1 font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
              <p className="mt-1 font-medium">{user.role}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 font-medium">
                {user.first_name} {user.last_name}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mt-1 font-medium capitalize">{user.status}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string | number
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

function StatusRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium">{label}</div>
      </div>
      <div className="text-sm text-muted-foreground">{value}</div>
    </div>
  )
}
