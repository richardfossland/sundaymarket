import { createBrowserClient } from '@supabase/ssr'

import { sharedCookieOptions } from './cookies'

/**
 * Browser Sunday Account (ISSUER project) auth client. Used ONLY on the host
 * login page to send the magic link / start the Google OAuth flow.
 *
 * Points at the SSO ISSUER project via NEW env — SEPARATE from the game's DATA
 * project. The DATA client (src/lib/supabase/client.ts) is session-less so the
 * two never fight over the sb-* cookie.
 */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions(),
    },
  )
}
