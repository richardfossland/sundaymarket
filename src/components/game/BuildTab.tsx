'use client'
import { useState } from 'react'
import { Player, Session } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { BUILDINGS, RESOURCE_EMOJIS } from '@/lib/constants'
import { canAfford } from '@/lib/game-helpers'
import InlineError from '@/components/InlineError'

export default function BuildTab({ player, session }: { player: Player; session: Session }) {
  const supabase = createClient()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const isBuilding = session.phase === 'building'

  async function build(type: string) {
    setBuilding(type)
    const { data } = await supabase.rpc('build_structure', {
      p_player_id:  player.id,
      p_session_id: session.id,
      p_type:       type,
    })
    setBuilding(null)
    if (data?.success) {
      setFeedbackError(false)
      setFeedback(`✅ Bygd! +${data.points} poeng`)
    } else {
      setFeedbackError(true)
      setFeedback(data?.error ?? 'Byggingen mislyktes')
    }
  }

  return (
    <div className="px-4 py-6 space-y-4 animate-fade-in">
      {!isBuilding && (
        <div className="bg-[#1A2D42] rounded-xl p-4 text-center">
          <p className="text-[#8A9BB0] text-sm">Bygging åpner etter handelsfasen.</p>
        </div>
      )}

      {feedback && (
        feedbackError ? (
          <InlineError onDismiss={() => setFeedback(null)}>{feedback}</InlineError>
        ) : (
          <div className="bg-[#1A2D42] rounded-xl p-3 text-sm text-center text-[#F0EEE9]">
            {feedback}
            <button onClick={() => setFeedback(null)} className="ml-2 text-[#8A9BB0] text-xs">✕</button>
          </div>
        )
      )}

      {BUILDINGS.map(b => {
        const affordable = canAfford(player.resources, b.cost)
        return (
          <div
            key={b.type}
            className={`bg-[#1A2D42] rounded-2xl p-4 border ${affordable && isBuilding ? 'border-[#EBB84B]/40' : 'border-[#243D57]'}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-[#F0EEE9]">{b.label}</h3>
                <p className="text-xs text-[#8A9BB0] mt-0.5">{b.description}</p>
              </div>
              <span className="text-[#EBB84B] font-bold text-lg whitespace-nowrap ml-3">
                +{b.points} p
              </span>
            </div>

            {/* Cost */}
            <div className="flex gap-3 mt-3 mb-3">
              {(['wood','stone','food','gold'] as const).filter(r => b.cost[r] > 0).map(r => (
                <div key={r} className="flex items-center gap-1">
                  <span className="text-sm">{RESOURCE_EMOJIS[r]}</span>
                  <span className={`text-sm font-medium ${player.resources[r] >= b.cost[r] ? 'text-[#F0EEE9]' : 'text-[#E07B39]'}`}>
                    {b.cost[r]}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => build(b.type)}
              disabled={!affordable || !isBuilding || building === b.type}
              className="w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[#EBB84B] text-[#0D1B2A]"
            >
              {building === b.type ? 'Bygger…' : affordable ? 'Bygg' : 'Ikke nok ressurser'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
