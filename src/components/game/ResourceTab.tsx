'use client'
import { Player, Session } from '@/types/game'
import { RESOURCE_EMOJIS, BUILDINGS } from '@/lib/constants'
import { canAfford } from '@/lib/game-helpers'

export default function ResourceTab({ player, session }: { player: Player; session: Session }) {
  const affordableBuilds = BUILDINGS.filter(b => canAfford(player.resources, b.cost))

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      {/* Score */}
      <div className="text-center">
        <div className="text-4xl font-bold text-[#F0BB47]">{player.score}</div>
        <div className="text-[#8A9BB0] text-sm mt-1">points</div>
      </div>

      {/* Resources */}
      <div className="bg-[#1A2D42] rounded-2xl p-4">
        <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-4">Your inventory</p>
        <div className="grid grid-cols-2 gap-3">
          {(['wood','stone','food','gold'] as const).map(r => (
            <div key={r} className="bg-[#0D1B2A] rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">{RESOURCE_EMOJIS[r]}</span>
              <div>
                <div className="text-xl font-bold text-[#F0EEE9]">{player.resources[r]}</div>
                <div className="text-xs text-[#8A9BB0] capitalize">{r}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What you can build */}
      {affordableBuilds.length > 0 && session.phase === 'building' && (
        <div className="bg-[#1A2D42] rounded-2xl p-4">
          <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-3">You can build now</p>
          <div className="space-y-2">
            {affordableBuilds.map(b => (
              <div key={b.type} className="flex items-center justify-between">
                <span className="text-sm text-[#F0EEE9]">{b.label}</span>
                <span className="text-[#F0BB47] font-bold text-sm">+{b.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint if lobby/production */}
      {session.phase === 'production' && (
        <div className="bg-[#1A2D42] rounded-2xl p-4 border border-[#F0BB47]/20">
          <p className="text-sm text-[#F0EEE9]">
            Resources incoming. Get ready to trade when the market opens.
          </p>
        </div>
      )}
    </div>
  )
}
