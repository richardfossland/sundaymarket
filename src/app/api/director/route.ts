// Server route: AI "town crier" narrator + difficulty director.
//
// SECURITY: the Anthropic API key lives ONLY here (Cloudflare Worker secret /
// server env), never in a client bundle. The host page calls THIS route; the
// route calls Anthropic. The model only SUGGESTS — resolveDirector() validates
// the suggestion against the WorldEventType enum before it can become game
// state. Keyless / failure / junk => fall back to the round's random event and
// hide narration (see resolveDirector + the catch below).

import { NextRequest } from 'next/server'
import { WORLD_EVENTS } from '@/lib/constants'
import { WorldEvent, WorldEventType } from '@/types/game'
import {
  RoundState,
  buildDirectorRequest,
  parseDirectorResponse,
  resolveDirector,
  VALID_EVENT_TYPES,
} from '@/lib/director'

// Not cached, runs at request time (reads request body + secret env).
export const dynamic = 'force-dynamic'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// LLM seam, mirroring the repo convention of an env-gated optional client:
// no key => null => keyless fallback. Reads from the OpenNext/Cloudflare env
// (process.env on the Worker) — the key is a Worker secret, never inlined.
function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

function randomEventType(): WorldEventType {
  return WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)].type
}

function eventFor(type: WorldEventType): WorldEvent {
  return WORLD_EVENTS.find(e => e.type === type)!
}

// Coerce an untrusted request body into a RoundState. The host page sends DB
// state; we never trust it for anything but prompt text, and the randomEventType
// is the guaranteed fallback regardless of what comes back from the model.
function readState(body: unknown): RoundState {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)

  let rolled = randomEventType()
  if (typeof b.randomEventType === 'string' && (VALID_EVENT_TYPES as string[]).includes(b.randomEventType)) {
    rolled = b.randomEventType as WorldEventType
  }

  return {
    round: num(b.round, 1),
    maxRounds: num(b.maxRounds, 1),
    phase: (typeof b.phase === 'string' ? b.phase : 'building') as RoundState['phase'],
    playerCount: num(b.playerCount, 0),
    topScore: num(b.topScore, 0),
    bottomScore: num(b.bottomScore, 0),
    averageScore: num(b.averageScore, 0),
    totalTrades: num(b.totalTrades, 0),
    randomEventType: rolled,
  }
}

export async function POST(request: NextRequest) {
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // Empty/invalid body is fine — we'll just use defaults + a random event.
  }

  const state = readState(body)
  const randomEvent = eventFor(state.randomEventType)
  const key = getAnthropicKey()

  // KEYLESS FALLBACK: behave exactly like the existing random-event flow,
  // narration hidden. Never blocks the round.
  if (!key) {
    return Response.json(
      resolveDirector(randomEvent, null, /* aiAvailable */ false),
    )
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(buildDirectorRequest(state)),
    })

    if (!res.ok) {
      // API error (rate limit, 5xx, auth) — degrade to random event.
      return Response.json(resolveDirector(randomEvent, null, true))
    }

    const raw = await res.json()
    const suggestion = parseDirectorResponse(raw)
    // resolveDirector enforces the enum guardrail; junk => random event.
    return Response.json(resolveDirector(randomEvent, suggestion, true))
  } catch {
    // Network failure / timeout — degrade to random event, never crash.
    return Response.json(resolveDirector(randomEvent, null, true))
  }
}
