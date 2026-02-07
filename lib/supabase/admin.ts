// Server-side admin client
// Uses SERVICE ROLE KEY - NEVER expose to client
// Import with "server-only" guard
import 'server-only'
import { createClient } from '@supabase/supabase-js'

// This ONLY runs server-side
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export { admin }

// Type definitions
export type { Database } from './types'
