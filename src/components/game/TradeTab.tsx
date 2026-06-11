'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Player, Session, Trade, Resources } from '@/types/game'
import { createClient } from '@/lib/supabase/client'
import { RESOURCE_EMOJIS, EMPTY_RESOURCES } from '@/lib/constants'
import { formatResources } from '@/lib/game-helpers'
import { QRCodeSVG } from 'qrcode.react'

// html5-qrcode is a browser-only (CommonJS) package — load it client-side only.
const QRScanner = dynamic(() => import('./QRScanner'), { ssr: false })

interface Props {
  player: Player
  session: Session
  pendingTrades: Trade[]
  onTradeResolved: (id: string) => void
}

export default function TradeTab({ player, session, pendingTrades, onTradeResolved }: Props) {
  const supabase = createClient()
  const [view, setView] = useState<'main' | 'scan' | 'offer' | 'incoming'>('main')
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null)
  const [targetPlayer, setTargetPlayer] = useState<Player | null>(null)
  const [offer,   setOffer]   = useState<Resources>({ ...EMPTY_RESOURCES })
  const [request, setRequest] = useState<Resources>({ ...EMPTY_RESOURCES })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null)

  const isTrading = session.phase === 'trading'

  // When a QR is scanned, load that player
  useEffect(() => {
    if (!targetPlayerId) return
    supabase.from('players').select('*').eq('id', targetPlayerId).single()
      .then(({ data }) => {
        if (data) { setTargetPlayer(data); setView('offer') }
        else { setFeedback('Player not found.'); setView('main') }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPlayerId])

  async function sendOffer() {
    if (!targetPlayer) return
    const totalOffer   = Object.values(offer).reduce((a, b) => a + b, 0)
    const totalRequest = Object.values(request).reduce((a, b) => a + b, 0)
    if (totalOffer === 0 && totalRequest === 0) { setFeedback('Add something to the trade.'); return }

    const { error } = await supabase.from('trades').insert({
      session_id:   session.id,
      initiator_id: player.id,
      receiver_id:  targetPlayer.id,
      offer,
      request,
      status: 'pending',
    })

    if (error) { setFeedback('Could not send offer.'); return }
    setFeedback(`Offer sent to ${targetPlayer.name}. Waiting…`)
    setView('main')
    setTargetPlayer(null)
    setTargetPlayerId(null)
    setOffer({ ...EMPTY_RESOURCES })
    setRequest({ ...EMPTY_RESOURCES })
  }

  async function respondToTrade(trade: Trade, accept: boolean) {
    if (accept) {
      const { data } = await supabase.rpc('accept_trade', {
        p_trade_id:   trade.id,
        p_receiver_id: player.id,
      })
      if (data?.success) {
        setFeedback(`✅ Trade accepted!`)
      } else {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', trade.id)
        setFeedback(`Trade failed: ${data?.error}`)
      }
    } else {
      await supabase.from('trades').update({ status: 'rejected' }).eq('id', trade.id)
      setFeedback('Trade declined.')
    }
    onTradeResolved(trade.id)
    setActiveTrade(null)
    setView('main')
  }

  function ResourceStepper({
    label, value, onChange, max
  }: { label: keyof Resources; value: number; onChange: (v: number) => void; max?: number }) {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{RESOURCE_EMOJIS[label]}</span>
          <span className="text-sm capitalize text-[#F0EEE9]">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-8 h-8 bg-[#243D57] rounded-lg text-[#F0EEE9] font-bold"
          >-</button>
          <span className="text-[#F0BB47] font-bold w-4 text-center">{value}</span>
          <button
            onClick={() => onChange(Math.min(max ?? 99, value + 1))}
            className="w-8 h-8 bg-[#243D57] rounded-lg text-[#F0EEE9] font-bold"
          >+</button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 animate-fade-in">
      {feedback && (
        <div className="bg-[#1A2D42] border border-[#F0BB47]/30 rounded-xl p-3 mb-4 text-sm text-[#F0EEE9] text-center">
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 text-[#8A9BB0] text-xs">✕</button>
        </div>
      )}

      {/* Incoming trades badge */}
      {pendingTrades.length > 0 && view === 'main' && (
        <div
          className="bg-[#E07B39]/20 border border-[#E07B39] rounded-xl p-4 mb-4 cursor-pointer"
          onClick={() => { setActiveTrade(pendingTrades[0]); setView('incoming') }}
        >
          <p className="text-[#E07B39] font-semibold text-sm">
            📬 {pendingTrades.length} incoming trade offer{pendingTrades.length > 1 ? 's' : ''}
          </p>
          <p className="text-[#8A9BB0] text-xs mt-0.5">Tap to review</p>
        </div>
      )}

      {view === 'main' && (
        <>
          {/* My QR code */}
          <div className="bg-[#1A2D42] rounded-2xl p-6 flex flex-col items-center mb-6">
            <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-4">Your trading code</p>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={player.id} size={160} />
            </div>
            <p className="text-[#F0EEE9] font-semibold mt-3">{player.name}</p>
            <p className="text-[#8A9BB0] text-xs mt-0.5 capitalize">{player.role}</p>
          </div>

          {/* Scan button */}
          <button
            onClick={() => setView('scan')}
            disabled={!isTrading}
            className="w-full bg-[#F0BB47] text-[#0D1B2A] font-bold py-4 rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📷 Scan to trade
          </button>
          {!isTrading && (
            <p className="text-center text-[#8A9BB0] text-xs mt-2">
              Trading opens in the trading phase
            </p>
          )}

          {/* Trade count */}
          <p className="text-center text-[#8A9BB0] text-sm mt-4">
            Trades completed: <span className="text-[#F0BB47] font-bold">{player.trade_count}</span>
          </p>
        </>
      )}

      {view === 'scan' && (
        <div className="space-y-4">
          <button onClick={() => setView('main')} className="text-[#8A9BB0] text-sm">← Back</button>
          <p className="text-[#F0EEE9] font-semibold">Scan another player&apos;s QR code</p>
          <QRScanner
            onScan={(result) => {
              setTargetPlayerId(result)
              setView('main')
            }}
            onClose={() => setView('main')}
          />
        </div>
      )}

      {view === 'offer' && targetPlayer && (
        <div className="space-y-4">
          <button onClick={() => { setView('main'); setTargetPlayer(null); setTargetPlayerId(null) }} className="text-[#8A9BB0] text-sm">
            ← Back
          </button>
          <div className="text-center">
            <p className="text-[#F0BB47] font-bold text-lg">{targetPlayer.name}</p>
            <p className="text-[#8A9BB0] text-sm capitalize">{targetPlayer.role}</p>
          </div>

          <div className="bg-[#1A2D42] rounded-xl p-4">
            <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-2">I will give</p>
            {(['wood','stone','food','gold'] as const).map(r => (
              <ResourceStepper
                key={r} label={r}
                value={offer[r]}
                max={player.resources[r]}
                onChange={v => setOffer(prev => ({ ...prev, [r]: v }))}
              />
            ))}
          </div>

          <div className="bg-[#1A2D42] rounded-xl p-4">
            <p className="text-xs text-[#8A9BB0] uppercase tracking-widest mb-2">I want</p>
            {(['wood','stone','food','gold'] as const).map(r => (
              <ResourceStepper
                key={r} label={r}
                value={request[r]}
                onChange={v => setRequest(prev => ({ ...prev, [r]: v }))}
              />
            ))}
          </div>

          <button
            onClick={sendOffer}
            className="w-full bg-[#F0BB47] text-[#0D1B2A] font-bold py-3 rounded-xl"
          >
            Send offer →
          </button>
        </div>
      )}

      {view === 'incoming' && activeTrade && (
        <div className="space-y-4">
          <p className="text-[#F0EEE9] font-semibold">Incoming trade offer</p>

          <div className="bg-[#1A2D42] rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs text-[#8A9BB0] mb-1">They give you</p>
              <p className="text-[#4A8C5C] font-medium">{formatResources(activeTrade.offer) || 'Nothing'}</p>
            </div>
            <div className="border-t border-[#243D57]" />
            <div>
              <p className="text-xs text-[#8A9BB0] mb-1">They want from you</p>
              <p className="text-[#E07B39] font-medium">{formatResources(activeTrade.request) || 'Nothing'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => respondToTrade(activeTrade, false)}
              className="bg-[#1A2D42] border border-[#E07B39] text-[#E07B39] font-bold py-3 rounded-xl"
            >
              Decline
            </button>
            <button
              onClick={() => respondToTrade(activeTrade, true)}
              className="bg-[#F0BB47] text-[#0D1B2A] font-bold py-3 rounded-xl"
            >
              Accept ✓
            </button>
          </div>

          {pendingTrades.length > 1 && (
            <button
              onClick={() => {
                onTradeResolved(activeTrade.id)
                const next = pendingTrades.find(t => t.id !== activeTrade.id)
                if (next) setActiveTrade(next)
                else setView('main')
              }}
              className="w-full text-[#8A9BB0] text-sm"
            >
              Skip ({pendingTrades.length - 1} more)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
