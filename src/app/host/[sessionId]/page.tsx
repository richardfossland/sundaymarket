'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Session, Player } from '@/types/game'
import { WORLD_EVENTS } from '@/lib/constants'

export default function HostPanel() {
  const params    = useParams()
  const router    = useRouter()
  const supabase  = createClient()
  const sessionId = params.sessionId as string

  const [session,  setSession]  = useState<Session | null>(null)
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    const hostId = localStorage.getItem('sundaymarket_host_id')
    if (!hostId) { router.push('/'); return }

    supabase.from('sessions').select('*').eq('id', sessionId).single()
      .then(({ data }) => { if (data && data.host_id === hostId) setSession(data) })

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

  async function advancePhase() {
    if (!session) return
    setLoading(true)

    if (session.phase === 'building') {
      // End of round: check if max rounds reached
      if (session.round >= session.max_rounds) {
        await supabase.from('sessions').update({ phase: 'ended' }).eq('id', sessionId)
      } else {
        // Pick random world event for next round
        const event = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)]
        await supabase.from('sessions').update({
          phase: 'production',
          round: session.round + 1,
          world_event: event,
          phase_started_at: new Date().toISOString(),
        }).eq('id', sessionId)
        // Run production
        await supabase.rpc('run_production', { p_session_id: sessionId })
        // Auto-advance to trading after 3 seconds
        setTimeout(async () => {
          await supabase.from('sessions').update({
            phase: 'trading',
            phase_started_at: new Date().toISOString(),
          }).eq('id', sessionId)
        }, 3000)
      }
    } else if (session.phase === 'lobby') {
      // Start game: round 1, first production
      const event = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)]
      await supabase.from('sessions').update({
        phase: 'production',
        round: 1,
        world_event: event,
        phase_started_at: new Date().toISOString(),
      }).eq('id', sessionId)
      await supabase.rpc('run_production', { p_session_id: sessionId })
      setTimeout(async () => {
        await supabase.from('sessions').update({
          phase: 'trading',
          phase_started_at: new Date().toISOString(),
        }).eq('id', sessionId)
      }, 3000)
    } else if (session.phase === 'trading') {
      await supabase.from('sessions').update({ phase: 'building' }).eq('id', sessionId)
    }

    setLoading(false)
  }

  const phaseButtonLabel: Record<string, string> = {
    lobby:      `Start game (${players.length} players joined)`,
    production: 'Open trading',
    trading:    'Close trading → Building',
    building:   session?.round === session?.max_rounds ? 'End game' : 'Next round',
    ended:      'Game ended',
  }

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[#8A9BB0]">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0BB47]">SundayMarket</h1>
          <p className="text-[#8A9BB0] text-sm">Session code: <span className="text-[#F0EEE9] font-bold tracking-widest">{session.code}</span></p>
        </div>
        <button
          onClick={() => router.push(`/host/${sessionId}/projector`)}
          className="bg-[#1A2D42] border border-[#243D57] rounded-xl px-4 py-2 text-sm text-[#F0EEE9]"
        >
          📺 Projector
        </button>
      </div>

      {/* Phase control */}
      <div className="bg-[#1A2D42] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#8A9BB0] uppercase tracking-widest">Current phase</p>
            <p className="text-[#F0EEE9] font-semibold capitalize mt-0.5">{session.phase}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8A9BB0]">Round</p>
            <p className="text-[#F0BB47] font-bold">{session.round}/{session.max_rounds}</p>
          </div>
        </div>

        {session.world_event && (
          <div className="bg-[#0D1B2A] rounded-xl p-3">
            <p className="text-xs text-[#8A9BB0] mb-1">Active world event</p>
            <p className="text-[#F0BB47] font-semibold">{session.world_event.title}</p>
            <p className="text-[#8A9BB0] text-xs mt-0.5">{session.world_event.description}</p>
          </div>
        )}

        <button
          onClick={advancePhase}
          disabled={loading || session.phase === 'ended'}
          className="w-full bg-[#F0BB47] text-[#0D1B2A] font-bold py-3 rounded-xl disabled:opacity-40"
        >
          {loading ? 'Working…' : phaseButtonLabel[session.phase]}
        </button>
      </div>

      {/* Players list */}
      <div className="bg-[#1A2D42] rounded-2xl p-4">
        <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-3">
          Players ({players.length})
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
                    <span className="text-[#8A9BB0] text-xs ml-2 capitalize">{p.role}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8A9BB0]">{p.trade_count} trades</span>
                  <span className="text-[#F0BB47] font-bold">{p.score} pts</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
