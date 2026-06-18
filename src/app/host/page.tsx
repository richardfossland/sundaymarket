import { redirect } from 'next/navigation'

import { AuthError, requireHost } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'

import HostDashboard, { type OktRow } from './HostDashboard'

// Reads the issuer session cookie + DATA service role at request time.
export const dynamic = 'force-dynamic'

/**
 * OPTIONAL Sunday Account host dashboard. Lists the games (økts) created by the
 * signed-in host so they can open/manage or delete them. Anonymous hosting from
 * the landing page is unaffected — those økts simply have host_user_id = NULL
 * and never appear here.
 */
export default async function HostHomePage() {
  let host: { id: string; email: string }
  try {
    host = await requireHost()
  } catch (err) {
    if (err instanceof AuthError && err.status === 401) {
      redirect('/host/login')
    }
    // 403: signed in but not on the MARKET_ADMIN_EMAILS allowlist.
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-2xl font-bold text-[#F0BB47] mb-2">SundayMarket</h1>
        <p className="text-[#8A9BB0] max-w-sm">
          You are signed in, but this account is not authorized to host. Ask an
          administrator to add your email to the host allowlist.
        </p>
        <a href="/host/login" className="mt-6 text-sm text-[#F0EEE9] underline">
          Use a different account
        </a>
      </main>
    )
  }

  const db = createServiceClient()
  const { data } = await db
    .from('sessions')
    .select('id, code, phase, round, max_rounds, created_at')
    .eq('host_user_id', host.id)
    .order('created_at', { ascending: false })

  const okts: OktRow[] = (data ?? []) as OktRow[]

  return <HostDashboard email={host.email} okts={okts} />
}
