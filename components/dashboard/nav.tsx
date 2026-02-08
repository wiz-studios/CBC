'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Settings,
  Users,
  BookOpen,
  GraduationCap,
  Clock,
  CheckSquare,
  BarChart3,
  FileText,
  School,
} from 'lucide-react'
import type { CurrentUser } from '@/lib/types'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Schools',
    href: '/dashboard/schools',
    icon: School,
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Classes',
    href: '/dashboard/classes',
    icon: BookOpen,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Students',
    href: '/dashboard/students',
    icon: GraduationCap,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Timetable',
    href: '/dashboard/timetable',
    icon: Clock,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Attendance',
    href: '/dashboard/attendance',
    icon: CheckSquare,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Marks',
    href: '/dashboard/marks',
    icon: BarChart3,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Reports',
    href: '/dashboard/reports',
    icon: FileText,
    roles: ['SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER'],
  },
  {
    title: 'Users',
    href: '/dashboard/users',
    icon: Users,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  },
]

interface DashboardNavProps {
  user: CurrentUser
}

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname()

  const filteredItems = navItems.filter((item) => item.roles.includes(user.role))
  const platformLabel = user.role === 'SUPER_ADMIN' ? 'Platform' : user.school?.name || 'School'
  const showLogo = user.role !== 'SUPER_ADMIN' && user.school?.logo_url

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-4 p-4 group-data-[collapsible=icon]:p-2">
        <div className="rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/60 p-3 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-accent text-sidebar-primary-foreground text-sm font-semibold shadow-[0_12px_24px_-18px_hsl(var(--sidebar-primary)/0.9)]">
              {showLogo ? (
                <img
                  src={user.school?.logo_url ?? ''}
                  alt={`${platformLabel} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                'CBC'
              )}
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold text-sidebar-foreground">CBC Academic</span>
              <span className="text-xs text-sidebar-foreground/70">{platformLabel}</span>
            </div>
          </div>
        </div>
        <Badge
          variant="secondary"
          className="w-fit bg-sidebar-primary/20 text-sidebar-foreground border border-sidebar-primary/30 group-data-[collapsible=icon]:hidden"
        >
          {user.role.replace('_', ' ')}
        </Badge>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.28em] text-sidebar-foreground/60">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.href} className={cn(isActive && 'text-sidebar-primary')}>
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
          <div className="text-[11px] uppercase tracking-[0.24em]">Signed in</div>
          <div className="mt-2 text-sm font-medium text-sidebar-foreground">{user.email}</div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
