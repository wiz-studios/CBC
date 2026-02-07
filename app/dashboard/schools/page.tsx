import { AuthGuard } from '@/components/auth-guard'
import { SchoolsList } from '@/components/schools/schools-list'
import { CreateSchoolDialog } from '@/components/schools/create-school-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Schools - CBC Academic System',
}

export default function SchoolsPage() {
  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-8">
        <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tenants</p>
              <h1 className="mt-2 text-4xl font-display font-semibold">Schools</h1>
              <p className="mt-2 text-muted-foreground">Manage tenant onboarding, status, and access control.</p>
            </div>
            <CreateSchoolDialog />
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>All Schools</CardTitle>
            <CardDescription>Filter, inspect, and manage each school</CardDescription>
          </CardHeader>
          <CardContent>
            <SchoolsList />
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}
