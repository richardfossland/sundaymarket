'use client'
import { useState } from 'react'
import { Player } from '@/types/game'
import { MISSIONS } from '@/lib/constants'

export default function MissionTab({ player }: { player: Player }) {
  const [revealed, setRevealed] = useState(false)
  const mission = MISSIONS[player.mission]

  return (
    <div className="px-4 py-6 animate-fade-in">
      <div className="bg-[#1A2D42] rounded-2xl p-6 text-center space-y-4">
        <div className="text-4xl">🎯</div>
        <h2 className="text-xl font-bold text-[#F0EEE9]">Hemmelig oppdrag</h2>

        {!revealed ? (
          <>
            <p className="text-[#8A9BB0] text-sm">Oppdraget ditt kjenner bare du til.</p>
            <button
              onClick={() => setRevealed(true)}
              className="bg-[#EBB84B] text-[#0D1B2A] font-bold px-6 py-2 rounded-xl"
            >
              Avslør oppdrag
            </button>
          </>
        ) : (
          <>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              player.mission_completed ? 'bg-[#4A8C5C]/20 text-[#4A8C5C]' : 'bg-[#EBB84B]/10 text-[#EBB84B]'
            }`}>
              {player.mission_completed ? '✅ Fullført!' : 'Pågår'}
            </div>
            <h3 className="text-[#EBB84B] text-xl font-bold">{mission.label}</h3>
            <p className="text-[#F0EEE9]">{mission.description}</p>
            <p className="text-[#8A9BB0] text-sm">Bonus: +{mission.bonus} poeng ved fullføring</p>

            <div className="bg-[#0D1B2A] rounded-xl p-3 mt-2">
              <p className="text-xs text-[#8A9BB0]">Handler så langt</p>
              <p className="text-2xl font-bold text-[#EBB84B] mt-0.5">{player.trade_count}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
