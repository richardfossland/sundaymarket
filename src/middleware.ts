import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { sharedCookieOptions } from '@/lib/supabase/cookies'

/**
 * Middleware for the OPTIONAL Sunday Account host login ONLY.
 *
 * Scope (see `config.matcher`): ONLY `/host` (the SSO dashboard), `/host/login`,
 * and `/auth/*` (the OAuth/magic-link callback). It refreshes the issuer session
 * cookie and redirects an unauthenticated visitor of the dashboard to
 * `/host/login`.
 *
 * It deliberately does NOT gate:
 *   - the anonymous host CONTROL PANEL at `/host/<sessionId>` (code + localStorage
 *     based — a vert running a live game must never be bounced to a login),
 *   - join / play / role-reveal / projector / display surfaces,
 *   - any game API.
 * Anonymous play is completely untouched.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options)
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // `/auth/*` (callback) and `/host/login` are always reachable without a
  // session — that is where the session is established. The dynamic host control
  // panel `/host/<sessionId>` is NOT matched here (see config.matcher) and stays
  // public. Only the bare dashboard `/host` is gated.
  const isDashboard = path === '/host'

  if (isDashboard && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/host/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Match ONLY the SSO surfaces. The anonymous `/host/<sessionId>` control panel
  // is excluded by the negative lookahead so it is never gated.
  matcher: ['/host', '/host/login', '/auth/:path*'],
}
