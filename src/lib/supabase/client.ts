import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client (anon key), scoped to the dedicated `market` schema
 * so SundayMarket can coexist with the other SundaySuite apps in the same
 * Supabase project without table clashes (free-tier 2-project limit).
 *
 * Every `.from('sessions')` / `.rpc('accept_trade')` call therefore resolves to
 * `market.sessions` / `market.accept_trade`. The game is session-scoped with
 * open RLS (no user auth), so the anon key is used for all reads/writes.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'market' },
    }
  )
}
