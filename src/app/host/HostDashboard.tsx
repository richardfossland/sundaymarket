'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createAuthBrowserClient } from '@/lib/supabase/auth-browser'

export type OktRow = {
  id: string
  code: string
  phase: string
  round: number
  max_rounds: number
  created_at: string
}

const PHASE_LABELS: Record<string, string> = {
  lobby: 'Lobby',
  production: 'Production',
  trading: 'Trading',
  building: 'Building',
  ended: 'Ended',
}

export default function HostDashboard({
  email,
  okts,
}: {
  email: string
  okts: OktRow[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<OktRow[]>(okts)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function signOut() {
    const supabase = createAuthBrowserClient()
    await supabase.auth.signOut()
    router.push('/host/login')
    router.refresh()
  }

  async function deleteOkt(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/host/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setRows((r) => r.filter((x) => x.id !== id))
      setConfirmId(null)
    } catch {
      setError('Could not delete that game. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F0BB47]">SundayMarket</h1>
          <p className="mt-1 text-[#8A9BB0] text-sm">
            My games · <span className="text-[#F0EEE9]">{email}</span>
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-[#8A9BB0] hover:text-[#F0EEE9] transition-colors"
        >
          Sign out
        </button>
      </div>

      <a
        href="/"
        className="inline-block bg-[#F0BB47] text-[#0D1B2A] font-bold py-3 px-5 rounded-xl mb-8"
      >
        Create new game →
      </a>

      {error && <p className="text-[#E07B39] text-sm mb-4">{error}</p>}

      {rows.length === 0 ? (
        <div className="bg-[#1A2D42] border border-[#243D57] rounded-xl px-5 py-8 text-center text-[#8A9BB0]">
          No games yet. Create one — it will show up here so you can re-open or
          delete it later.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((okt) => (
            <li
              key={okt.id}
              className="bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-[#F0EEE9] tracking-widest">{okt.code}</div>
                <div className="text-xs text-[#8A9BB0]">
                  {PHASE_LABELS[okt.phase] ?? okt.phase} · round {okt.round}/
                  {okt.max_rounds} · {new Date(okt.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/host/${okt.id}`}
                  className="text-sm font-medium text-[#0D1B2A] bg-[#F0BB47] py-2 px-3 rounded-lg"
                >
                  Open
                </a>
                {confirmId === okt.id ? (
                  <>
                    <button
                      onClick={() => deleteOkt(okt.id)}
                      disabled={busyId === okt.id}
                      className="text-sm font-medium text-[#0D1B2A] bg-[#E07B39] py-2 px-3 rounded-lg disabled:opacity-50"
                    >
                      {busyId === okt.id ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-sm text-[#8A9BB0] py-2 px-2"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setError(null)
                      setConfirmId(okt.id)
                    }}
                    className="text-sm font-medium text-[#E07B39] border border-[#E07B39]/40 py-2 px-3 rounded-lg"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
