import { createServerClient } from '@supabase/ssr'

/**
 * Server-side DATA Supabase client (anon), scoped to the dedicated `market`
 * schema. The game has open RLS and no user auth, so this is used only for
 * anonymous data reads/writes from server contexts.
 *
 * SESSION-LESS + no cookie writes: it must NOT touch cookies, because the
 * OPTIONAL Sunday Account host login owns the sb-* auth cookie (a SEPARATE
 * issuer project). A no-op cookie adapter guarantees this DATA client can never
 * overwrite that session.
 */
export async function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'market' },
      auth: { persistSession: false, autoRefreshToken: false },
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
