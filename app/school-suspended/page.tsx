import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SuspendedActions } from './suspended-actions'

export const metadata = {
  title: 'School Suspended - CBC Academic System',
}

export default async function SchoolSuspendedPage() {
  const user = await getCurrentUser()

  if (!user) redirect('/auth')
  if (user.role === 'SUPER_ADMIN') redirect('/dashboard')
  if (user.school?.is_active !== false) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>School account suspended</CardTitle>
          <CardDescription>
            Access for <span className="font-medium text-foreground">{user.school?.name ?? 'your school'}</span> is
            currently suspended. Please contact your administrator or platform support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Signed in as: <span className="text-foreground">{user.email}</span>
            </p>
            <p>
              School code: <span className="text-foreground">{user.school?.code ?? '-'}</span>
            </p>
          </div>

          <SuspendedActions />
        </CardContent>
      </Card>
    </div>
  )
}

