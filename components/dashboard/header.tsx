'use client'

import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User, Settings } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { toast } from 'sonner'
import type { CurrentUser } from '@/lib/types'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface DashboardHeaderProps {
  user: CurrentUser
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  const pageTitle = (() => {
    if (pathname === '/dashboard') return 'Overview'
    if (pathname.startsWith('/dashboard/schools')) return 'Schools'
    if (pathname.startsWith('/dashboard/analytics')) return 'Analytics'
    if (pathname.startsWith('/dashboard/classes')) return 'Classes'
    if (pathname.startsWith('/dashboard/students')) return 'Students'
    if (pathname.startsWith('/dashboard/timetable')) return 'Timetable'
    if (pathname.startsWith('/dashboard/attendance')) return 'Attendance'
    if (pathname.startsWith('/dashboard/marks')) return 'Marks'
    if (pathname.startsWith('/dashboard/reports')) return 'Reports'
    if (pathname.startsWith('/dashboard/users')) return 'Users'
    if (pathname.startsWith('/dashboard/settings')) return 'Settings'
    return 'Dashboard'
  })()

  const handleSignOut = async () => {
    try {
      const result = await signOut()
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Signed out successfully')
      router.push('/auth')
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign out')
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/60 via-accent/70 to-primary/60" />
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="rounded-full bg-primary/10 hover:bg-primary/20" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">CBC Academic</p>
            <h2 className="text-2xl font-semibold font-display">{pageTitle}</h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Badge variant="outline" className="hidden sm:inline-flex border-primary/30 text-primary">
            {user.role.replace('_', ' ')}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 rounded-full px-2 hover:bg-primary/10">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center text-sm font-semibold">
                  {user.first_name.charAt(0)}
                  {user.last_name.charAt(0)}
                </div>
                <div className="text-sm hidden sm:block">
                  <p className="font-medium">{user.first_name} {user.last_name}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-2 text-xs space-y-1">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{user.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Role</p>
                  <p className="font-medium text-foreground">{user.role}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <button className="w-full flex gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button className="w-full flex gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </button>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <button
                  onClick={handleSignOut}
                  className="w-full flex gap-2 cursor-pointer text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
