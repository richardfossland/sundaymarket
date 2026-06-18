'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Session, Player, WorldEvent } from '@/types/game'
import { WORLD_EVENTS, ROLE_LABELS } from '@/lib/constants'

export default function HostPanel() {
  const params    = useParams()
  const router    = useRouter()
  const supabase  = createClient()
  const sessionId = params.sessionId as string

  const [session,  setSession]  = useState<Session | null>(null)
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(false)
  const [isHost,   setIsHost]   = useState(false)

  // AI "town crier" director suggestion for the NEXT round (pending host action).
  // null = none asked for yet. Always carries a VALIDATED event from the server.
  interface DirectorResult {
    narration: string
    event: WorldEvent
    suggestionApplied: boolean
    reasoning: string
    aiAvailable: boolean
  }
  const [director, setDirector] = useState<DirectorResult | null>(null)
  const [askingAi, setAskingAi] = useState(false)

  // How long the brief "production" animation runs before trading auto-opens.
  const PRODUCTION_MS = 3000

  useEffect(() => {
    const hostId = localStorage.getItem('sundaymarket_host_id')
    if (!hostId) { router.push('/'); return }

    supabase.from('sessions').select('*').eq('id', sessionId).single()
      .then(({ data }) => {
        if (data && data.host_id === hostId) { setSession(data); setIsHost(true) }
        else if (data) { setSession(data) } // viewer without control
      })

    supabase.from('players').select('*').eq('session_id', sessionId)
      .then(({ data }) => { if (data) setPlayers(data) })

    // Realtime
    const sub = supabase.channel('host-room')
      .on('postgres_changes', { event: '*', schema: 'market', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => supabase.from('players').select('*').eq('session_id', sessionId).then(({ data }) => { if (data) setPlayers(data) })
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'market', table: 'sessions', filter: `id=eq.${sessionId}` },
        payload => setSession(payload.new as Session)
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Self-healing production → trading transition. Driven by phase_started_at, so
  // it survives a host reload/crash mid-production (the old detached setTimeout
  // would strand the game in 'production' forever if the tab closed). The
  // `.eq('phase','production')` guard makes concurrent host tabs a safe no-op.
  useEffect(() => {
    if (!isHost || !session) return
    if (session.phase !== 'production' || !session.phase_started_at) return

    const elapsed = Date.now() - new Date(session.phase_started_at).getTime()
    const delay = Math.max(0, PRODUCTION_MS - elapsed)
    const id = setTimeout(() => {
      supabase.from('sessions')
        .update({ phase: 'trading', phase_started_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('phase', 'production')
    }, delay)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, session?.phase, session?.phase_started_at])

  // Start a production round. By default rolls a random world event (unchanged
  // behavior). If the host one-tapped the AI town crier's suggestion, that
  // server-VALIDATED event + narration is passed in instead.
  async function beginProduction(round: number, override?: { event: WorldEvent; narration: string }) {
    const event = override?.event ?? WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)]
    await supabase.from('sessions').update({
      phase: 'production',
      round,
      world_event: event,
      narration: override?.narration ?? null,
      phase_started_at: new Date().toISOString(),
    }).eq('id', sessionId)
    await supabase.rpc('run_production', { p_session_id: sessionId })
    setDirector(null) // consumed
  }

  // Consult the AI town crier for the NEXT round. The server reads the round
  // state, asks Claude (if a key is configured), VALIDATES the suggestion
  // against the world-event enum, and returns a guaranteed-valid event +
  // narration. Keyless / failure => aiAvailable:false, falls back silently.
  async function askDirector() {
    if (!session || !isHost) return
    setAskingAi(true)
    try {
      const sorted = [...players].sort((a, b) => b.score - a.score)
      const scores = players.map(p => p.score)
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      const res = await fetch('/api/director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          round: session.round + 1,
          maxRounds: session.max_rounds,
          phase: session.phase,
          playerCount: players.length,
          topScore: sorted[0]?.score ?? 0,
          bottomScore: sorted[sorted.length - 1]?.score ?? 0,
          averageScore: avg,
          totalTrades: players.reduce((s, p) => s + p.trade_count, 0),
        }),
      })
      if (res.ok) setDirector(await res.json() as DirectorResult)
    } catch {
      // Network failure on the client — leave director null; host just uses
      // the normal random-event path. Never blocks the game.
    } finally {
      setAskingAi(false)
    }
  }

  async function advancePhase() {
    if (!session || !isHost) return
    setLoading(true)

    // If the host asked the town crier and applied the suggestion, hand the
    // VALIDATED event + narration to beginProduction; otherwise it rolls random.
    const override = director?.suggestionApplied
      ? { event: director.event, narration: director.narration }
      : undefined

    if (session.phase === 'lobby') {
      if (players.length < 1) { setLoading(false); return }
      await beginProduction(1, override)
    } else if (session.phase === 'production') {
      // Manual override: open trading immediately.
      await supabase.from('sessions')
        .update({ phase: 'trading', phase_started_at: new Date().toISOString() })
        .eq('id', sessionId).eq('phase', 'production')
    } else if (session.phase === 'trading') {
      // Close the market: expire any unanswered offers, then open building.
      await supabase.rpc('expire_pending_trades', { p_session_id: sessionId })
      await supabase.from('sessions').update({ phase: 'building' }).eq('id', sessionId)
    } else if (session.phase === 'building') {
      if (session.round >= session.max_rounds) {
        // finalize_game resolves end-game missions AND flips phase to 'ended'.
        await supabase.rpc('finalize_game', { p_session_id: sessionId })
      } else {
        await beginProduction(session.round + 1, override)
      }
    }

    setLoading(false)
  }

  const phaseButtonLabel: Record<string, string> = {
    lobby:      players.length < 1 ? 'Venter på spillere…' : `Start spillet (${players.length} spiller${players.length === 1 ? '' : 'e'})`,
    production: 'Åpne handel nå',
    trading:    'Steng handel → Bygging',
    building:   session?.round === session?.max_rounds ? 'Avslutt spillet' : 'Neste runde',
    ended:      'Spillet er over',
  }

  const phaseLabel: Record<string, string> = {
    lobby:      'Venterom',
    production: 'Produksjon',
    trading:    'Handel',
    building:   'Bygging',
    ended:      'Avsluttet',
  }

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[#8A9BB0]">Laster…</div>
    </div>
  )

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#EBB84B]">SundayMarket</h1>
          <p className="text-[#8A9BB0] text-sm">Spillkode: <span className="text-[#F0EEE9] font-bold tracking-widest">{session.code}</span></p>
        </div>
        <button
          onClick={() => router.push(`/host/${sessionId}/projector`)}
          className="bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-2 text-sm text-[#F0EEE9]"
        >
          📺 Storskjerm
        </button>
      </div>

      {/* Phase control */}
      <div className="bg-[#1A2D42] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#8A9BB0] uppercase tracking-widest">Nåværende fase</p>
            <p className="text-[#F0EEE9] font-semibold mt-0.5">{phaseLabel[session.phase] ?? session.phase}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8A9BB0]">Runde</p>
            <p className="text-[#EBB84B] font-bold">{session.round}/{session.max_rounds}</p>
          </div>
        </div>

        {session.world_event && (
          <div className="bg-[#0D1B2A] rounded-xl p-3">
            <p className="text-xs text-[#8A9BB0] mb-1">Aktiv verdenshendelse</p>
            <p className="text-[#EBB84B] font-semibold">{session.world_event.title}</p>
            <p className="text-[#8A9BB0] text-xs mt-0.5">{session.world_event.description}</p>
            {session.narration && (
              <p className="text-[#F0EEE9] text-sm mt-2 italic">📣 {session.narration}</p>
            )}
          </div>
        )}

        {/* AI town crier — available before the NEXT round starts (lobby, or a
            non-final building phase). The host can ask, then one-tap apply. */}
        {isHost &&
          (session.phase === 'lobby' ||
            (session.phase === 'building' && session.round < session.max_rounds)) && (
            <div className="bg-[#0D1B2A] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#8A9BB0]">📣 Byutroperen (AI)</p>
                <button
                  onClick={askDirector}
                  disabled={askingAi}
                  className="text-xs bg-[#1A2D42] border border-[#243D57] rounded-lg px-3 py-1 text-[#F0EEE9] disabled:opacity-40"
                >
                  {askingAi ? 'Spør…' : 'Spør byutroperen'}
                </button>
              </div>

              {director && !director.aiAvailable && (
                <p className="text-[#8A9BB0] text-xs">AI ikke tilgjengelig — neste runde bruker tilfeldig hendelse.</p>
              )}

              {director && director.aiAvailable && director.suggestionApplied && (
                <div className="space-y-1">
                  {director.narration && (
                    <p className="text-[#F0EEE9] text-sm italic">{director.narration}</p>
                  )}
                  <p className="text-[#EBB84B] text-sm font-semibold">
                    Foreslår: {director.event.title}
                  </p>
                  <p className="text-[#8A9BB0] text-xs">{director.reasoning}</p>
                  <p className="text-[#8A9BB0] text-xs">
                    Trykk «{phaseButtonLabel[session.phase]}» for å bruke forslaget.
                  </p>
                </div>
              )}

              {director && director.aiAvailable && !director.suggestionApplied && (
                <p className="text-[#8A9BB0] text-xs">
                  AI ga ikke et gyldig forslag — neste runde bruker tilfeldig hendelse.
                </p>
              )}
            </div>
          )}

        <button
          onClick={advancePhase}
          disabled={
            loading ||
            !isHost ||
            session.phase === 'ended' ||
            (session.phase === 'lobby' && players.length < 1)
          }
          className="w-full bg-[#EBB84B] text-[#0D1B2A] font-bold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Jobber…' : phaseButtonLabel[session.phase]}
        </button>
        {!isHost && (
          <p className="text-center text-[#8A9BB0] text-xs">Kun visning — åpne dette spillet på vertsenheten for å styre det.</p>
        )}
      </div>

      {/* Players list */}
      <div className="bg-[#1A2D42] rounded-2xl p-4">
        <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-3">
          Spillere ({players.length})
        </p>
        <div className="space-y-2">
          {players
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <span className="text-[#8A9BB0] text-sm w-5">{i + 1}.</span>
                  <div>
                    <span className="text-[#F0EEE9] text-sm">{p.name}</span>
                    <span className="text-[#8A9BB0] text-xs ml-2">{ROLE_LABELS[p.role]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8A9BB0]">{p.trade_count} handler</span>
                  <span className="text-[#EBB84B] font-bold">{p.score} p</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
