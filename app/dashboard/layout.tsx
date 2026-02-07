import React from "react"
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { DashboardNav } from '@/components/dashboard/nav'
import { DashboardHeader } from '@/components/dashboard/header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const metadata = {
  title: 'Dashboard - CBC Academic System',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth')
  }

  if (user.role !== 'SUPER_ADMIN' && user.school?.is_active === false) {
    redirect('/school-suspended')
  }

  return (
    <SidebarProvider>
      <DashboardNav user={user} />
      <SidebarInset>
        <DashboardHeader user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-[1500px] space-y-6">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
