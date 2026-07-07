import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client (anon key), scoped to the dedicated `market` schema
 * so SundayMarket can coexist with the other SundaySuite apps in the same
 * Supabase project without table clashes (free-tier 2-project limit).
 *
 * Every `.from('sessions')` / `.rpc('accept_trade')` call therefore resolves to
 * `market.sessions` / `market.accept_trade`. The game is session-scoped with
 * open RLS (no user auth), so the anon key is used for all reads/writes.
 *
 * SESSION-LESS: `persistSession: false` so this DATA client never writes its own
 * sb-* cookie. The OPTIONAL Sunday Account host login owns the auth cookie (a
 * SEPARATE issuer project via auth-browser/auth-server); keeping this client
 * stateless means the two never clobber each other and anonymous play is
 * completely unaffected.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'market' },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

/**
 * Every public column of `sessions` EXCEPT `host_id`. anon/authenticated no
 * longer have SELECT on host_id (migration 0008 — it is the host's bearer
 * secret), so reads must list columns explicitly instead of `select('*')`,
 * which would fail on the revoked column. "Am I the host?" is answered by the
 * `is_host` RPC, never by reading the secret.
 */
export const SESSION_COLS =
  'id,code,phase,round,max_rounds,trade_seconds,phase_started_at,world_event,created_at,narration,host_user_id'
