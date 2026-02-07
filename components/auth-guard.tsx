import React from "react"
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

interface AuthGuardProps {
  allowedRoles?: string[]
  children: React.ReactNode
}

export async function AuthGuard({
  allowedRoles,
  children,
}: AuthGuardProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth')
  }

  // School suspension: hard-stop access for non-platform users
  if (user.role !== 'SUPER_ADMIN' && user.school?.is_active === false) {
    redirect('/school-suspended')
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
