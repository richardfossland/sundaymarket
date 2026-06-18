/**
 * Pure host-allowlist logic for the OPTIONAL Sunday Account host login.
 * Kept free of `server-only` / Supabase imports so it is unit-testable and
 * reusable from both the server auth helper and tests.
 *
 * FAIL-CLOSED: an empty/unset allowlist means NOBODY is an admin (the host
 * feature is effectively off until an owner sets MARKET_ADMIN_EMAILS). This is
 * the single source of truth for "who may host".
 */

/** Parse a comma/whitespace/newline-separated allowlist into lowercased emails. */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Is `email` on the given allowlist? Fail-closed on empty list / missing email. */
export function isEmailAllowed(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  if (!email) return false
  return parseAdminEmails(raw).includes(email.trim().toLowerCase())
}
