'use client'
import { useEffect, useState } from 'react'
import { Player, Session } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { MISSIONS, ROLE_LABELS } from '@/lib/constants'

export default function EndScreen({ player, session }: { player: Player; session: Session }) {
  const supabase = createClient()
  const [allPlayers, setAllPlayers] = useState<Player[]>([])

  useEffect(() => {
    supabase.from('players').select('*').eq('session_id', session.id)
      .then(({ data }) => { if (data) setAllPlayers(data.sort((a, b) => b.score - a.score)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rank = allPlayers.findIndex(p => p.id === player.id) + 1
  const mission = MISSIONS[player.mission]

  return (
    <div className="min-h-screen px-4 py-8 flex flex-col items-center animate-fade-in">
      <div className="text-center mb-8">
        <div className="text-5xl mb-2">
          {rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎮'}
        </div>
        <h1 className="text-3xl font-bold text-[#F0BB47]">Game over!</h1>
        <p className="text-[#8A9BB0] mt-1">You finished #{rank} of {allPlayers.length}</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Your score */}
        <div className="bg-[#1A2D42] rounded-2xl p-5 text-center">
          <p className="text-[#8A9BB0] text-sm mb-1">Your final score</p>
          <p className="text-5xl font-bold text-[#F0BB47]">{player.score}</p>
          <p className="text-[#8A9BB0] text-sm mt-2">{player.trade_count} trades · {ROLE_LABELS[player.role]}</p>
        </div>

        {/* Mission result */}
        <div className={`bg-[#1A2D42] rounded-2xl p-4 border ${player.mission_completed ? 'border-[#4A8C5C]' : 'border-[#243D57]'}`}>
          <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-1">Secret mission</p>
          <p className="text-[#F0BB47] font-semibold">{mission.label}</p>
          <p className="text-[#8A9BB0] text-xs mt-0.5">{mission.description}</p>
          <p className={`text-sm font-medium mt-2 ${player.mission_completed ? 'text-[#4A8C5C]' : 'text-[#E07B39]'}`}>
            {player.mission_completed ? `✅ Completed! +${mission.bonus} pts` : '❌ Not completed'}
          </p>
        </div>

        {/* Full leaderboard */}
        <div className="bg-[#1A2D42] rounded-2xl p-4">
          <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-3">Final standings</p>
          <div className="space-y-2">
            {allPlayers.map((p, i) => (
              <div key={p.id} className={`flex justify-between items-center ${p.id === player.id ? 'text-[#F0BB47]' : 'text-[#F0EEE9]'}`}>
                <span className="text-sm">{i + 1}. {p.name} {p.id === player.id ? '(you)' : ''}</span>
                <span className="font-bold">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
