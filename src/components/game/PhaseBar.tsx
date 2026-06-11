'use client'
import { useEffect, useState } from 'react'
import { Session } from '@/types/game'

export default function PhaseBar({ session }: { session: Session }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (session.phase !== 'trading' || !session.phase_started_at) {
      setSecondsLeft(null)
      return
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(session.phase_started_at!).getTime()) / 1000)
      const remaining = session.trade_seconds - elapsed
      setSecondsLeft(Math.max(0, remaining))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session.phase, session.phase_started_at, session.trade_seconds])

  const phaseLabel: Record<string, string> = {
    lobby:      'Waiting to start',
    production: 'Production',
    trading:    'Trading open',
    building:   'Building phase',
    ended:      'Game over',
  }

  return (
    <div className="bg-[#1A2D42] border-b border-[#243D57] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-[#8A9BB0]">Round {session.round}/{session.max_rounds}</span>
          <span className="text-sm font-medium text-[#F0EEE9]">{phaseLabel[session.phase]}</span>
        </div>
        {session.world_event && (
          <div className="bg-[#243D57] rounded-lg px-2 py-1 text-xs text-[#F0BB47]">
            {session.world_event.title}
          </div>
        )}
      </div>
      {secondsLeft !== null && (
        <div className={`text-2xl font-bold tabular-nums ${secondsLeft < 30 ? 'text-[#E07B39]' : 'text-[#F0BB47]'}`}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </div>
      )}
    </div>
  )
}
