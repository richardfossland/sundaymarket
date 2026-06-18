import { authFail, requireHost } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'

// Reads the issuer session cookie + DATA service role at request time.
export const dynamic = 'force-dynamic'

/**
 * Owner-gated delete of one game (økt). Authorization order:
 *   1. requireHost() — 401 if not signed in, 403 if not on MARKET_ADMIN_EMAILS.
 *   2. market.delete_session(id, host.id) — a SECURITY DEFINER function that
 *      deletes ONLY when host_user_id matches the signed-in host. The client can
 *      never name an arbitrary owner: we pass the server-resolved host id.
 *      FK cascade removes players/trades/buildings/prices.
 *
 * 200 { deleted: true } on success; 404 when the session does not exist or is
 * not owned by this host (incl. anonymous sessions with host_user_id = NULL).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let host: { id: string; email: string }
  try {
    host = await requireHost()
  } catch (err) {
    const fail = authFail(err)
    if (fail) return fail
    throw err
  }

  const { id } = await params
  const db = createServiceClient()
  const { data, error } = await db.rpc('delete_session', {
    p_session_id: id,
    p_host_user_id: host.id,
  })

  if (error) {
    return Response.json({ error: 'delete_failed' }, { status: 500 })
  }
  if (data !== true) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  return Response.json({ deleted: true })
}
