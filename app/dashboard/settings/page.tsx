import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { SchoolSettingsForm } from '@/components/settings/school-settings-form'
import { TermsManager } from '@/components/settings/terms-manager'
import { ResultsSettingsForm } from '@/components/settings/results-settings-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const metadata = {
  title: 'Settings - CBC Academic System',
}

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth')

  const allowed = ['SUPER_ADMIN', 'SCHOOL_ADMIN']
  if (!allowed.includes(user.role)) redirect('/dashboard')

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Configuration</p>
            <h1 className="mt-2 text-4xl font-display font-semibold">Settings</h1>
            <p className="mt-2 text-muted-foreground">Manage school profile, academic terms, and system info.</p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="school" className="space-y-6">
        <TabsList>
          <TabsTrigger value="school">School</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
          {user.role === 'SCHOOL_ADMIN' ? <TabsTrigger value="results">Results</TabsTrigger> : null}
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="school">
          <Card>
            <CardHeader>
              <CardTitle>School Profile</CardTitle>
              <CardDescription>School details used across the platform and reports.</CardDescription>
            </CardHeader>
            <CardContent>
              <SchoolSettingsForm canEdit={user.role === 'SCHOOL_ADMIN'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic">
          <Card>
            <CardHeader>
              <CardTitle>Academic Calendar</CardTitle>
              <CardDescription>Manage academic terms and set the current term.</CardDescription>
            </CardHeader>
            <CardContent>
              <TermsManager canManage={user.role === 'SCHOOL_ADMIN'} />
            </CardContent>
          </Card>
        </TabsContent>

        {user.role === 'SCHOOL_ADMIN' ? (
          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle>Results Settings</CardTitle>
                <CardDescription>
                  Configure KCSE grade bands, ranking policy, subject-load rules, and exclusions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResultsSettingsForm canEdit={user.role === 'SCHOOL_ADMIN'} />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>System</CardTitle>
              <CardDescription>Platform-level configuration and references.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {user.role === 'SUPER_ADMIN' ? (
                <>
                  <p>Use the Schools module to manage tenants and suspend/reactivate access.</p>
                  <p>Use Analytics for platform-wide monitoring and audit visibility.</p>
                </>
              ) : (
                <>
                  <p>System roles and permissions are managed by the platform administrator.</p>
                  <p>Configure your school profile and academic calendar in the other tabs.</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Account and access safety.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Authentication is handled by Supabase Auth with server-side session cookies.</p>
              <p>Row Level Security (RLS) restricts data access by school and role.</p>
              <p>Administrative actions are recorded to the audit log.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
