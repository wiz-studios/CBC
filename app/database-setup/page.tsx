import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Database Setup - CBC Academic System',
}

export default function DatabaseSetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-2">
          <CardTitle>Database setup required</CardTitle>
          <CardDescription>
            Your Supabase schema/RBAC is not ready yet (or your user profile row is missing).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Run these SQL scripts in Supabase (in order):</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li><code>scripts/001_init_schema.sql</code></li>
              <li><code>scripts/002_rbac_seed.sql</code></li>
              <li><code>scripts/003_minimal_rls.sql</code></li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Then verify env vars exist:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
              <li><code>SUPABASE_SERVICE_ROLE_KEY</code></li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild variant="default">
              <Link href="/auth">Go to sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Try dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

