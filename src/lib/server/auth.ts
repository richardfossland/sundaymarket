import 'server-only'

import { isEmailAllowed } from '@/lib/host-allowlist'
import { createAuthClient } from '@/lib/supabase/auth-server'

/**
 * Host (vert) authorization for the OPTIONAL Sunday Account login.
 *
 * This is the ONE authorization spot, and it is FAIL-CLOSED: a host is allowed
 * iff their verified Sunday Account email is on the MARKET_ADMIN_EMAILS
 * allowlist. Anonymous code-based hosting/joining/displaying is NOT affected by
 * any of this — those paths never call requireHost().
 */

export class AuthError extends Error {
  status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

/**
 * Fail-closed allowlist check against MARKET_ADMIN_EMAILS. Empty/unset allowlist
 * => NOBODY is admin (the feature is effectively off until an owner sets it).
 * Parsing lives in the pure, unit-tested `host-allowlist` module.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  return isEmailAllowed(email, process.env.MARKET_ADMIN_EMAILS)
}

/** Resolve the signed-in Sunday Account host from the issuer session cookie. */
export async function getHostUser() {
  const supabase = await createAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Require a signed-in AND allowlisted host. Throws AuthError(401) when not
 * signed in, AuthError(403) when signed in but not on MARKET_ADMIN_EMAILS.
 * Returns { id, email } of the authorized host on success.
 */
export async function requireHost(): Promise<{ id: string; email: string }> {
  const user = await getHostUser()
  if (!user) throw new AuthError(401, 'not_signed_in')
  if (!isAdminEmail(user.email)) throw new AuthError(403, 'not_allowlisted')
  return { id: user.id, email: user.email! }
}

/** Uniform catch → Response for API routes. Returns null for non-auth errors. */
export function authFail(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  return null
}
