import { getHostUser, isAdminEmail } from '@/lib/server/auth'

// Reads the issuer session cookie at request time.
export const dynamic = 'force-dynamic'

/**
 * Best-effort "who is the signed-in host" probe for OWNER-STAMPING on create.
 *
 * Returns { userId } ONLY when there is a signed-in AND allowlisted Sunday
 * Account host; otherwise { userId: null }. The anonymous landing create flow
 * calls this, and stamps host_user_id with the returned id when present — but
 * NEVER blocks on it, so anonymous hosting keeps working with owner = NULL.
 */
export async function GET() {
  try {
    const user = await getHostUser()
    if (user && isAdminEmail(user.email)) {
      return Response.json({ userId: user.id })
    }
  } catch {
    // fall through to anonymous
  }
  return Response.json({ userId: null })
}
