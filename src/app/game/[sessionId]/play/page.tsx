'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Player, Session, Trade } from '@/types/game'

import ResourceTab from '@/components/game/ResourceTab'
import TradeTab    from '@/components/game/TradeTab'
import BuildTab    from '@/components/game/BuildTab'
import MissionTab  from '@/components/game/MissionTab'
import PhaseBar    from '@/components/game/PhaseBar'
import EndScreen   from '@/components/game/EndScreen'

type Tab = 'resources' | 'trade' | 'build' | 'mission'

export default function PlayPage() {
  const params    = useParams()
  const router    = useRouter()
  const supabase  = createClient()
  const sessionId = params.sessionId as string

  const [player,  setPlayer]  = useState<Player | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [tab,     setTab]     = useState<Tab>('resources')
  const [pendingTrades, setPendingTrades] = useState<Trade[]>([])

  // Load player + session
  useEffect(() => {
    const playerId = localStorage.getItem('sundaymarket_player_id')
    if (!playerId) { router.push('/'); return }

    Promise.all([
      supabase.from('players').select('*').eq('id', playerId).single(),
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
    ]).then(([{ data: p }, { data: s }]) => {
      if (p) setPlayer(p)
      if (s) setSession(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Realtime subscriptions
  useEffect(() => {
    if (!player) return

    const playerSub = supabase
      .channel(`player-${player.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'market', table: 'players', filter: `id=eq.${player.id}`
      }, payload => setPlayer(payload.new as Player))
      .subscribe()

    const sessionSub = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'market', table: 'sessions', filter: `id=eq.${sessionId}`
      }, payload => setSession(payload.new as Session))
      .subscribe()

    const tradeSub = supabase
      .channel(`trades-${player.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'market', table: 'trades',
        filter: `receiver_id=eq.${player.id}`
      }, payload => {
        const trade = payload.new as Trade
        if (trade.status === 'pending') {
          setPendingTrades(prev => [trade, ...prev])
          setTab('trade') // Auto-switch to trade tab
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(playerSub)
      supabase.removeChannel(sessionSub)
      supabase.removeChannel(tradeSub)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, sessionId])

  // Load pending trades on mount
  useEffect(() => {
    if (!player) return
    supabase.from('trades')
      .select('*')
      .eq('receiver_id', player.id)
      .eq('status', 'pending')
      .then(({ data }) => { if (data) setPendingTrades(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id])

  const removePendingTrade = useCallback((tradeId: string) => {
    setPendingTrades(prev => prev.filter(t => t.id !== tradeId))
  }, [])

  if (!player || !session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[#8A9BB0]">Loading…</div>
    </div>
  )

  if (session.phase === 'ended') {
    return <EndScreen player={player} session={session} />
  }

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      {/* Phase bar at top */}
      <PhaseBar session={session} />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {tab === 'resources' && <ResourceTab player={player} session={session} />}
        {tab === 'trade'     && (
          <TradeTab
            player={player}
            session={session}
            pendingTrades={pendingTrades}
            onTradeResolved={removePendingTrade}
          />
        )}
        {tab === 'build'    && <BuildTab player={player} session={session} />}
        {tab === 'mission'  && <MissionTab player={player} />}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#1A2D42] border-t border-[#243D57] grid grid-cols-4">
        {([
          { id: 'resources', label: 'Resources', icon: '🎒', badge: 0 },
          { id: 'trade',     label: 'Trade',     icon: '🤝', badge: pendingTrades.length },
          { id: 'build',     label: 'Build',     icon: '🏗️', badge: 0 },
          { id: 'mission',   label: 'Mission',   icon: '🎯', badge: 0 },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-col items-center py-3 text-xs transition-colors ${
              tab === t.id ? 'text-[#F0BB47]' : 'text-[#8A9BB0]'
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span className="mt-0.5">{t.label}</span>
            {t.badge > 0 && (
              <span className="absolute top-2 right-4 bg-[#E07B39] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
