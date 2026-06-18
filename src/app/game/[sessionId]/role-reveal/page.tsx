'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Player } from '@/types/game'
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_EMOJIS, ROLE_PRODUCTION, MISSIONS, RESOURCE_EMOJIS, RESOURCE_LABELS } from '@/lib/constants'

export default function RoleRevealPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [player, setPlayer] = useState<Player | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const playerId = localStorage.getItem('sundaymarket_player_id')
    if (!playerId) { router.push('/'); return }

    supabase.from('players').select('*').eq('id', playerId).single()
      .then(({ data }) => { if (data) setPlayer(data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!player) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[#8A9BB0]">Laster…</div>
    </div>
  )

  const prod = ROLE_PRODUCTION[player.role]
  const mission = MISSIONS[player.mission]

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {!revealed ? (
        <div className="animate-fade-in">
          <p className="text-[#8A9BB0] mb-4">Rollen din er tildelt</p>
          <button
            onClick={() => setRevealed(true)}
            className="bg-[#1A2D42] border-2 border-[#EBB84B] rounded-2xl p-12 text-6xl animate-pulse-gold hover:scale-105 transition-transform"
          >
            ?
          </button>
          <p className="mt-4 text-[#8A9BB0] text-sm">Trykk for å avsløre</p>
        </div>
      ) : (
        <div className="animate-fade-in w-full max-w-sm space-y-6">
          <div className="text-7xl">{ROLE_EMOJIS[player.role]}</div>
          <h1 className="text-3xl font-bold text-[#EBB84B]">{ROLE_LABELS[player.role]}</h1>
          <p className="text-[#8A9BB0] leading-relaxed">{ROLE_DESCRIPTIONS[player.role]}</p>

          {/* Production per round */}
          <div className="bg-[#1A2D42] rounded-xl p-4">
            <p className="text-xs text-[#8A9BB0] mb-3 uppercase tracking-widest">Du produserer hver runde</p>
            <div className="flex justify-center gap-4">
              {(Object.keys(prod) as (keyof typeof prod)[]).filter(k => prod[k] > 0).map(k => (
                <div key={k} className="flex flex-col items-center">
                  <span className="text-2xl">{RESOURCE_EMOJIS[k]}</span>
                  <span className="text-[#EBB84B] font-bold text-xl">+{prod[k]}</span>
                  <span className="text-[#8A9BB0] text-xs">{RESOURCE_LABELS[k]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Secret mission (blurred) */}
          <div className="bg-[#1A2D42] rounded-xl p-4 border border-[#243D57]">
            <p className="text-xs text-[#8A9BB0] mb-1 uppercase tracking-widest">Hemmelig oppdrag</p>
            <p className="text-[#EBB84B] font-semibold filter blur-sm select-none">{mission.label}</p>
            <p className="text-[#8A9BB0] text-sm mt-1 filter blur-sm select-none">{mission.description}</p>
            <p className="text-xs text-[#8A9BB0] mt-2">Avsløres i Oppdrag-fanen</p>
          </div>

          <button
            onClick={() => router.push(`/game/${params.sessionId}/play`)}
            className="w-full bg-[#EBB84B] text-[#0D1B2A] font-bold py-3 rounded-xl"
          >
            Inn på markedet →
          </button>
        </div>
      )}
    </main>
  )
}
