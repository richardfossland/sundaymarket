'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Session, Player, Building } from '@/types/game'
import PriceTicker from '@/components/game/PriceTicker'

export default function ProjectorView() {
  const params    = useParams()
  const supabase  = createClient()
  const sessionId = params.sessionId as string

  const [session,   setSession]   = useState<Session | null>(null)
  const [players,   setPlayers]   = useState<Player[]>([])
  const [, setBuildings] = useState<Building[]>([])
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('players').select('*').eq('session_id', sessionId),
      supabase.from('buildings').select('*').eq('session_id', sessionId),
    ]).then(([{ data: s }, { data: p }, { data: b }]) => {
      if (s) setSession(s)
      if (p) setPlayers(p)
      if (b) setBuildings(b)
    })

    const sub = supabase.channel('projector')
      .on('postgres_changes', { event: 'UPDATE', schema: 'market', table: 'sessions', filter: `id=eq.${sessionId}` },
        payload => setSession(payload.new as Session))
      .on('postgres_changes', { event: '*', schema: 'market', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => supabase.from('players').select('*').eq('session_id', sessionId).then(({ data }) => { if (data) setPlayers(data) }))
      .on('postgres_changes', { event: 'INSERT', schema: 'market', table: 'buildings', filter: `session_id=eq.${sessionId}` },
        () => supabase.from('buildings').select('*').eq('session_id', sessionId).then(({ data }) => { if (data) setBuildings(data) }))
      .subscribe()

    return () => { supabase.removeChannel(sub) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Countdown
  useEffect(() => {
    if (!session || session.phase !== 'trading' || !session.phase_started_at) { setSecondsLeft(null); return }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(session.phase_started_at!).getTime()) / 1000)
      setSecondsLeft(Math.max(0, session.trade_seconds - elapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session?.phase, session?.phase_started_at, session?.trade_seconds])

  const sorted = [...players].sort((a, b) => b.score - a.score)
  const totalTrades = players.reduce((sum, p) => sum + p.trade_count, 0)
  const topTrader = [...players].sort((a, b) => b.trade_count - a.trade_count)[0]

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D1B2A]">
      <div className="text-[#8A9BB0] text-2xl">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0D1B2A] p-10 flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-8 items-start">
      {/* Left: World event + phase info */}
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-[#F0BB47]">SundayMarket</h1>
          <p className="text-[#8A9BB0] text-xl mt-1">Round {session.round}/{session.max_rounds}</p>
        </div>

        {session.world_event && (
          <div className="bg-[#1A2D42] rounded-2xl p-6">
            <p className="text-[#8A9BB0] text-sm uppercase tracking-widest mb-2">World event</p>
            <p className="text-[#F0BB47] text-2xl font-bold">{session.world_event.title}</p>
            <p className="text-[#F0EEE9] mt-2">{session.world_event.description}</p>
          </div>
        )}

        {/* AI town crier narration — only shown when present (hidden keyless). */}
        {session.narration && (
          <div className="bg-[#1A2D42] rounded-2xl p-6">
            <p className="text-[#8A9BB0] text-sm uppercase tracking-widest mb-2">📣 Byutroperen</p>
            <p className="text-[#F0EEE9] text-xl italic leading-relaxed">{session.narration}</p>
          </div>
        )}

        <div className="bg-[#1A2D42] rounded-2xl p-6 space-y-3">
          <div>
            <p className="text-[#8A9BB0] text-sm">Total trades this session</p>
            <p className="text-4xl font-bold text-[#F0BB47]">{totalTrades}</p>
          </div>
          {topTrader && (
            <div>
              <p className="text-[#8A9BB0] text-sm">Most active trader</p>
              <p className="text-[#F0EEE9] text-xl font-semibold">{topTrader.name}</p>
              <p className="text-[#8A9BB0]">{topTrader.trade_count} trades</p>
            </div>
          )}
        </div>
      </div>

      {/* Center: Timer or phase display */}
      <div className="flex flex-col items-center justify-center space-y-4">
        {session.phase === 'trading' && secondsLeft !== null ? (
          <>
            <p className="text-[#8A9BB0] text-xl uppercase tracking-widest">Market closes in</p>
            <div className={`text-9xl font-bold tabular-nums ${secondsLeft < 30 ? 'text-[#E07B39]' : 'text-[#F0BB47]'}`}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </div>
            <p className="text-[#4A8C5C] text-2xl animate-pulse">Market is OPEN</p>
          </>
        ) : (
          <div className="text-center">
            <p className="text-[#8A9BB0] text-xl uppercase tracking-widest mb-4">
              {session.phase === 'lobby'      && 'Waiting for players'}
              {session.phase === 'production' && 'Resources incoming…'}
              {session.phase === 'building'   && 'Building phase'}
              {session.phase === 'ended'      && 'Game over!'}
            </p>
            <p className="text-6xl font-bold text-[#F0BB47] capitalize">{session.phase}</p>
          </div>
        )}
      </div>

      {/* Right: Leaderboard */}
      <div className="bg-[#1A2D42] rounded-2xl p-6">
        <p className="text-[#8A9BB0] text-sm uppercase tracking-widest mb-4">Leaderboard</p>
        <div className="space-y-4">
          {sorted.slice(0, 8).map((p, i) => (
            <div key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${i === 0 ? 'text-[#F0BB47]' : 'text-[#8A9BB0]'}`}>
                  {i + 1}.
                </span>
                <span className={`text-xl ${i === 0 ? 'text-[#F0EEE9] font-bold' : 'text-[#8A9BB0]'}`}>
                  {p.name}
                </span>
              </div>
              <span className={`text-2xl font-bold ${i === 0 ? 'text-[#F0BB47]' : 'text-[#F0EEE9]'}`}>
                {p.score}
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Live market price index — full-width exchange board ticker */}
      <PriceTicker sessionId={sessionId} />
    </div>
  )
}
