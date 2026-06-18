'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { generateSessionCode, pickRandomRole, pickRandomMission } from '@/lib/game-helpers'
import InlineError from '@/components/InlineError'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'join' | 'host'>('join')

  async function joinGame() {
    setError('')
    if (!code.trim() || !name.trim()) { setError('Skriv inn både spillkode og navn.'); return }
    setLoading(true)

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single()

    if (!session) { setError('Fant ikke spillet. Sjekk koden.'); setLoading(false); return }
    if (session.phase !== 'lobby') { setError('Dette spillet har allerede startet.'); setLoading(false); return }

    const { data: existingPlayers } = await supabase
      .from('players')
      .select('role')
      .eq('session_id', session.id)

    const existingRoles = (existingPlayers || []).map(p => p.role)
    const role     = pickRandomRole(existingRoles)
    const mission  = pickRandomMission()

    const { data: player, error: insertError } = await supabase
      .from('players')
      .insert({ session_id: session.id, name: name.trim(), role, resources: { wood:0,stone:0,food:0,gold:0 }, mission })
      .select()
      .single()

    if (insertError || !player) { setError('Kunne ikke bli med. Prøv igjen.'); setLoading(false); return }

    localStorage.setItem('sundaymarket_player_id', player.id)
    localStorage.setItem('sundaymarket_session_id', session.id)
    router.push(`/game/${session.id}/role-reveal`)
  }

  async function createSession() {
    setError('')
    setLoading(true)
    const hostId = crypto.randomUUID()

    // OPTIONAL Sunday Account owner-stamp. Best-effort ONLY: if a host is signed
    // in (and allowlisted) we tag the økt with their user id so it shows in their
    // "my games" dashboard. Anonymous hosting MUST keep working, so any failure
    // here just leaves host_user_id = NULL — never blocks create.
    let hostUserId: string | null = null
    try {
      const res = await fetch('/host/api/whoami')
      if (res.ok) hostUserId = (await res.json()).userId ?? null
    } catch {
      // not signed in / offline / route unavailable — anonymous create proceeds
    }
    const ownerCols = hostUserId ? { host_user_id: hostUserId } : {}

    // The code space is small (8 words × 90 numbers), so collisions happen.
    // Retry with a fresh code on the unique-constraint violation (Postgres 23505).
    let session = null
    for (let attempt = 0; attempt < 8 && !session; attempt++) {
      const { data, error: err } = await supabase
        .from('sessions')
        .insert({ code: generateSessionCode(), host_id: hostId, phase: 'lobby', round: 0, max_rounds: 6, ...ownerCols })
        .select()
        .single()

      if (data) { session = data; break }
      if (err && err.code !== '23505') {
        setError('Kunne ikke opprette spill.'); setLoading(false); return
      }
      // else: duplicate code — loop and try another
    }

    if (!session) { setError('Kunne ikke opprette spill. Prøv igjen.'); setLoading(false); return }

    localStorage.setItem('sundaymarket_host_id', hostId)
    router.push(`/host/${session.id}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* Logo / Title */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#EBB84B]">SundayMarket</h1>
        <p className="mt-2 text-[#8A9BB0] text-sm">Et byttehandelsspill. Ingen vinner alene.</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-8 bg-[#1A2D42] p-1 rounded-xl">
        <button
          onClick={() => setMode('join')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'join' ? 'bg-[#EBB84B] text-[#0D1B2A]' : 'text-[#8A9BB0]'
          }`}
        >
          Bli med
        </button>
        <button
          onClick={() => setMode('host')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'host' ? 'bg-[#EBB84B] text-[#0D1B2A]' : 'text-[#8A9BB0]'
          }`}
        >
          Vert et spill
        </button>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {mode === 'join' ? (
          <>
            <input
              type="text"
              placeholder="Spillkode (f.eks. OAK-42)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="w-full bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-3 text-[#F0EEE9] placeholder-[#8A9BB0] focus:outline-none focus:border-[#EBB84B] uppercase tracking-widest text-center text-xl"
            />
            <input
              type="text"
              placeholder="Ditt navn"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-3 text-[#F0EEE9] placeholder-[#8A9BB0] focus:outline-none focus:border-[#EBB84B]"
            />
            <button
              onClick={joinGame}
              disabled={loading}
              className="w-full bg-[#EBB84B] text-[#0D1B2A] font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Blir med…' : 'Bli med →'}
            </button>
          </>
        ) : (
          <button
            onClick={createSession}
            disabled={loading}
            className="w-full bg-[#EBB84B] text-[#0D1B2A] font-bold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Oppretter…' : 'Opprett nytt spill →'}
          </button>
        )}

        {error && <InlineError onDismiss={() => setError('')}>{error}</InlineError>}
      </div>

      {/* Discreet host sign-in: OPTIONAL "my games" dashboard via Sunday Account.
          Anonymous hosting above needs none of this. */}
      <a
        href="/host"
        className="mt-10 text-xs text-[#8A9BB0]/70 hover:text-[#8A9BB0] transition-colors"
      >
        Host sign-in
      </a>
    </main>
  )
}
