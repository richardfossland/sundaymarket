'use client'
import { usePrices } from '@/lib/use-prices'
import { RESOURCE_EMOJIS, RESOURCE_LABELS, RESOURCE_COLORS } from '@/lib/constants'

/**
 * Big projector-facing exchange board: a live ticker of the market price index
 * with per-resource up/down arrows. Reads market.prices over realtime, so it
 * updates the moment a trade is accepted anywhere in the session.
 */
export default function PriceTicker({ sessionId }: { sessionId: string }) {
  const prices = usePrices(sessionId)

  return (
    <div className="bg-[#1A2D42] rounded-2xl p-6">
      <p className="text-[#8A9BB0] text-sm uppercase tracking-widest mb-4">Exchange board</p>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {prices.map(({ resource, price, direction }) => (
          <div key={resource} className="flex items-center gap-3">
            <span className="text-3xl">{RESOURCE_EMOJIS[resource]}</span>
            <div>
              <p className="text-[#8A9BB0] text-sm uppercase tracking-wide">
                {RESOURCE_LABELS[resource]}
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: RESOURCE_COLORS[resource] }}
                >
                  {price.toFixed(1)}
                </span>
                <span
                  className={`text-xl font-bold ${
                    direction > 0
                      ? 'text-[#4A8C5C]'
                      : direction < 0
                        ? 'text-[#E07B39]'
                        : 'text-[#8A9BB0]'
                  }`}
                  aria-label={direction > 0 ? 'up' : direction < 0 ? 'down' : 'unchanged'}
                >
                  {direction > 0 ? '▲' : direction < 0 ? '▼' : '–'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
