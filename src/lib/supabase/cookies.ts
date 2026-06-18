import type { CookieOptions } from '@supabase/ssr'

/**
 * Shared cookie options for the Sunday Account (issuer) auth clients — browser,
 * server, middleware — so the session cookie is written identically everywhere.
 *
 * Cross-subdomain SSO: when `NEXT_PUBLIC_COOKIE_DOMAIN` is set (`.sundaysuite.app`
 * in production) the session cookie is scoped to the parent domain so every
 * Sunday web app shares ONE host login. Left unset in local dev so cookies keep
 * working on `localhost`.
 *
 * NOTE: this scopes ONLY the Sunday Account auth cookie. The game's own DATA
 * Supabase client is session-less (see auth-browser / client) and never writes a
 * competing sb-* cookie.
 */
export function sharedCookieOptions(): CookieOptions {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim()
  if (!domain) return {}
  return {
    domain,
    path: '/',
    sameSite: 'lax',
    secure: true,
  }
}
