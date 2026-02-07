import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for database
export type School = {
  id: string
  name: string
  code: string
  motto?: string
  principal_name?: string
  principal_email?: string
  phone?: string
  address?: string
  county?: string
  sub_county?: string
  school_type: string
  curriculum_version: string
  created_at: string
  updated_at: string
  is_active: boolean
}

export type User = {
  id: string
  school_id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  id_number?: string
  role: 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT'
  status: string
  auth_provider: string
  last_login?: string
  created_at: string
  updated_at: string
}

export type Teacher = {
  id: string
  user_id: string
  employee_number: string
  tsc_number?: string
  qualification?: string
  specializations?: string
  date_hired?: string
  is_head_teacher: boolean
  is_deputy_head: boolean
  created_at: string
  updated_at: string
}

export type Student = {
  id: string
  user_id?: string
  school_id: string
  admission_number: string
  class_id: string
  date_of_birth: string
  gender: string
  national_id?: string
  parent_name?: string
  parent_email?: string
  parent_phone?: string
  admission_date?: string
  status: string
  created_at: string
  updated_at: string
}

export type Class = {
  id: string
  school_id: string
  name: string
  grade_level: number
  stream?: string
  class_teacher_id?: string
  capacity?: number
  current_enrollment: number
  created_at: string
  updated_at: string
  is_active: boolean
}

export type Subject = {
  id: string
  school_id: string
  code: string
  name: string
  description?: string
  curriculum_area?: string
  is_compulsory: boolean
  created_at: string
  updated_at: string
}

export type AcademicTerm = {
  id: string
  school_id: string
  year: number
  term: number
  term_name?: string
  start_date: string
  end_date: string
  is_current: boolean
  created_at: string
  updated_at: string
}
