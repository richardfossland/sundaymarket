import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { sharedCookieOptions } from './cookies'

/**
 * Server-side Sunday Account (ISSUER project) auth client, bound to the request
 * cookies. Used ONLY to resolve the signed-in host from the session cookie.
 *
 * This points at the SSO ISSUER Supabase project via NEW env
 * (NEXT_PUBLIC_SUNDAY_AUTH_URL / NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY) — DISTINCT
 * from the game's DATA project (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY), which is
 * left UNCHANGED. The game's data client stays anon + session-less.
 */
export async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // In Server Components cookie writes throw; the middleware refreshes
          // the session, so swallowing here is safe.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // no-op in RSC render context
          }
        },
      },
    },
  )
}
