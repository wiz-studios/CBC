import { AuthGuard } from '@/components/auth-guard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarksEntry } from '@/components/marks/marks-entry'
import { AssessmentTypesManager } from '@/components/marks/assessment-types-manager'
import { AssessmentsManager } from '@/components/marks/assessments-manager'
import { PerformanceSummary } from '@/components/marks/performance-summary'
import { SubjectSelectionManager } from '@/components/marks/subject-selection-manager'
import { getCurrentUser } from '@/lib/auth'

export const metadata = {
  title: 'Marks - CBC Academic System',
}

export default async function MarksPage() {
  const user = await getCurrentUser()
  if (!user) return null

  const canManageTypes = user.role === 'SCHOOL_ADMIN' || user.role === 'HEAD_TEACHER'
  const canManageSelections = user.role === 'SCHOOL_ADMIN' || user.role === 'HEAD_TEACHER'
  const staffRole =
    user.role === 'SCHOOL_ADMIN' || user.role === 'HEAD_TEACHER' || user.role === 'TEACHER'
      ? user.role
      : 'SCHOOL_ADMIN'

  return (
    <AuthGuard allowedRoles={['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']}>
      <div className="space-y-8">
        <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Assessment</p>
              <h1 className="mt-2 text-4xl font-display font-semibold">Marks & Assessments</h1>
              <p className="mt-2 text-muted-foreground">Enter marks, track submissions, and review performance.</p>
            </div>
          </div>
        </section>

        <Tabs defaultValue="entry" className="space-y-6">
          <TabsList>
            <TabsTrigger value="entry">Mark Entry</TabsTrigger>
            <TabsTrigger value="selection">Subject Selection</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="types">Assessment Types</TabsTrigger>
          </TabsList>

          <TabsContent value="entry">
            <MarksEntry />
          </TabsContent>

          <TabsContent value="selection">
            <SubjectSelectionManager canManage={canManageSelections} />
          </TabsContent>

          <TabsContent value="assessments">
            <AssessmentsManager role={staffRole} />
          </TabsContent>

          <TabsContent value="performance">
            <PerformanceSummary />
          </TabsContent>

          <TabsContent value="types">
            <AssessmentTypesManager canManage={canManageTypes} />
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  )
}
