import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import type { Database } from '@/lib/supabase/types'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes: avoid calling supabase.auth.getUser() here to prevent noisy
  // AuthSessionMissingError console output during local development.
  // (Logged-in users can still navigate to /auth, which is acceptable.)
  if (pathname === '/auth' || pathname === '/database-setup') {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // All other routes require authentication
  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/auth'
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Run middleware on all routes except:
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
