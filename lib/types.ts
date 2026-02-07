import type { Database } from '@/lib/supabase/types'

export type SystemRoleName =
  | 'SUPER_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'HEAD_TEACHER'
  | 'TEACHER'

export type SchoolRow = Database['public']['Tables']['schools']['Row']
export type UserRow = Database['public']['Tables']['users']['Row']

export type CurrentUser = UserRow & {
  role: SystemRoleName
  roles: SystemRoleName[]
  school: Pick<SchoolRow, 'id' | 'name' | 'code' | 'is_active'> | null
}
