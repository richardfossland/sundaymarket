'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

/**
 * Entry redirect for /game/[sessionId]. If this device has already joined
 * (player id in localStorage) send them to the play screen; otherwise back to
 * the landing page to enter a code + name.
 */
export default function GameEntryPage() {
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    const playerId = localStorage.getItem('sundaymarket_player_id')
    if (playerId) router.replace(`/game/${params.sessionId}/play`)
    else router.replace('/')
  }, [router, params.sessionId])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[#8A9BB0]">Laster…</div>
    </div>
  )
}
