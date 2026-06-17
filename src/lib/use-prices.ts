'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Price, ResourceKey } from '@/types/game'
import { RESOURCE_ORDER, DEFAULT_PRICES } from '@/lib/constants'

export interface PricePoint {
  resource: ResourceKey
  price: number
  prevPrice: number
  /** -1 down, 0 flat, +1 up — drives the ticker arrow. */
  direction: -1 | 0 | 1
}

/**
 * Subscribe to the live market price index (market.prices) for a session.
 * Loads the current rows, then keeps them fresh over Supabase realtime. Always
 * returns one PricePoint per resource in canonical order, falling back to the
 * schema default anchor before the first trade has been priced.
 */
export function usePrices(sessionId: string): PricePoint[] {
  const [rows, setRows] = useState<Record<ResourceKey, Price>>(
    {} as Record<ResourceKey, Price>,
  )

  useEffect(() => {
    if (!sessionId) return
    const supabase = createClient()

    const ingest = (data: Price[]) =>
      setRows(prev => {
        const next = { ...prev }
        for (const row of data) next[row.resource] = row
        return next
      })

    supabase
      .from('prices')
      .select('*')
      .eq('session_id', sessionId)
      .then(({ data }) => { if (data) ingest(data as Price[]) })

    const sub = supabase
      .channel(`prices-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'market', table: 'prices', filter: `session_id=eq.${sessionId}` },
        payload => {
          const row = payload.new as Price
          if (row?.resource) ingest([row])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [sessionId])

  return RESOURCE_ORDER.map(resource => {
    const row = rows[resource]
    const price = row?.price ?? DEFAULT_PRICES[resource]
    const prevPrice = row?.prev_price ?? price
    const direction: -1 | 0 | 1 =
      price > prevPrice ? 1 : price < prevPrice ? -1 : 0
    return { resource, price, prevPrice, direction }
  })
}
