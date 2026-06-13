'use client'
import { usePrices } from '@/lib/use-prices'
import { RESOURCE_EMOJIS } from '@/lib/constants'

/**
 * Compact one-line market price hint for the player trade screen. Same live
 * data as the projector ticker, sized for a phone: emoji + price + a small
 * up/down arrow per resource.
 */
export default function PriceHint({ sessionId }: { sessionId: string }) {
  const prices = usePrices(sessionId)

  return (
    <div className="bg-[#1A2D42] rounded-xl px-3 py-2 mb-4">
      <div className="flex items-center justify-between">
        {prices.map(({ resource, price, direction }) => (
          <div key={resource} className="flex items-center gap-1">
            <span className="text-base">{RESOURCE_EMOJIS[resource]}</span>
            <span className="text-[#F0EEE9] text-sm font-semibold tabular-nums">
              {price.toFixed(1)}
            </span>
            <span
              className={`text-xs ${
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
        ))}
      </div>
    </div>
  )
}
