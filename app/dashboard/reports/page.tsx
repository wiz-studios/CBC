import { AuthGuard } from '@/components/auth-guard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReportCardsTable } from '@/components/reports/report-cards-table'
import { ReportsGenerator } from '@/components/reports/reports-generator'
import { getCurrentUser } from '@/lib/auth'

export const metadata = {
  title: 'Reports - CBC Academic System',
}

export default async function ReportsPage() {
  const user = await getCurrentUser()
  if (!user) return null

  const canPublish = user.role === 'SCHOOL_ADMIN' || user.role === 'HEAD_TEACHER'
  const canGenerate = canPublish

  return (
    <AuthGuard allowedRoles={['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']}>
      <div className="space-y-8">
        <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reporting</p>
              <h1 className="mt-2 text-4xl font-display font-semibold">Reports</h1>
              <p className="mt-2 text-muted-foreground">Generate, review, and publish report cards.</p>
            </div>
          </div>
        </section>

        <Tabs defaultValue="cards" className="space-y-6">
          <TabsList>
            <TabsTrigger value="cards">Report Cards</TabsTrigger>
            <TabsTrigger value="generate">Generate Reports</TabsTrigger>
            <TabsTrigger value="publish">Publish Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <ReportCardsTable canPublish={canPublish} />
          </TabsContent>

          <TabsContent value="generate">
            <ReportsGenerator canGenerate={canGenerate} />
          </TabsContent>

          <TabsContent value="publish">
            <ReportCardsTable canPublish={canPublish} defaultStatus="DRAFT" showBulkPublish />
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  )
}
