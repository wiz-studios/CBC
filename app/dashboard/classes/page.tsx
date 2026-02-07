import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { ClassesManager } from '@/components/classes/classes-manager'

export const metadata = {
  title: 'Classes - CBC Academic System',
}

export default async function ClassesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth')

  const allowed = ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER']
  if (!allowed.includes(user.role)) redirect('/dashboard')

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Academics</p>
            <h1 className="mt-2 text-4xl font-display font-semibold">Classes</h1>
            <p className="mt-2 text-muted-foreground">Manage school classes, streams, and capacity.</p>
          </div>
        </div>
      </section>

      <ClassesManager canManage={user.role === 'SCHOOL_ADMIN'} />
    </div>
  )
}
