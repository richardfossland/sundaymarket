import { NextResponse } from 'next/server'

import { createAuthClient } from '@/lib/supabase/auth-server'

// Not cached — exchanges an OAuth/magic-link code for the issuer session cookie.
export const dynamic = 'force-dynamic'

/**
 * Sunday Account OAuth / magic-link landing. Exchanges the code for a session
 * cookie on the ISSUER project, then sends the host to the dashboard.
 *
 * Hardened: the post-login redirect target is taken from `?next=` ONLY when it
 * is a same-origin ABSOLUTE PATH (starts with a single `/`, not `//`). Anything
 * else (open-redirect attempts, missing/failed code) falls back to `/host`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  const rawNext = searchParams.get('next')
  const safeNext =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/host'

  if (code) {
    const supabase = await createAuthClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/host/login?error=auth`)
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}
