import { createClient } from '@supabase/supabase-js'

/**
 * DATA-project service-role client, scoped to the `market` schema. Bypasses RLS
 * — used ONLY by owner-gated server routes (e.g. the host dashboard delete) to
 * call the SECURITY DEFINER `market.delete_session`. NEVER imported into client
 * code; the service-role key is a Worker secret, never inlined into the bundle.
 *
 * Points at the existing DATA project (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) — the Sunday Account ISSUER project is separate.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: 'market' },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
