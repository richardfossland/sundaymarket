// Pure unit tests for the AI town crier director. NO NETWORK, NO API KEY.
// Run with: npm test  (tsx --test, honors the @/ tsconfig path alias)
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  VALID_EVENT_TYPES,
  buildToolSchema,
  buildDirectorRequest,
  parseDirectorResponse,
  findEvent,
  resolveDirector,
  RoundState,
  DIRECTOR_MODEL,
} from '@/lib/director'
import { WORLD_EVENTS } from '@/lib/constants'

const SAMPLE_STATE: RoundState = {
  round: 3,
  maxRounds: 6,
  phase: 'building',
  playerCount: 8,
  topScore: 410,
  bottomScore: 40,
  averageScore: 180,
  totalTrades: 57,
  randomEventType: 'storm',
}

// A real WorldEvent to use as the random fallback in guardrail tests.
const RANDOM_FALLBACK = WORLD_EVENTS.find(e => e.type === 'storm')!

// ---- request builder -------------------------------------------------------

test('buildDirectorRequest targets the current Opus model and forces the tool', () => {
  const req = buildDirectorRequest(SAMPLE_STATE) as Record<string, unknown>
  assert.equal(req.model, DIRECTOR_MODEL)
  assert.equal(DIRECTOR_MODEL, 'claude-opus-4-8')
  assert.deepEqual(req.tool_choice, { type: 'tool', name: 'narrate_round' })
  const tools = req.tools as Array<{ name: string }>
  assert.equal(tools[0].name, 'narrate_round')
  // Round state is woven into the user prompt (so the model can reason on spread).
  const userMsg = (req.messages as Array<{ content: string }>)[0].content
  assert.match(userMsg, /Runde 3 av 6/)
  assert.match(userMsg, /spredning 370/) // 410 - 40
})

test('tool schema enum exactly matches the real world-event types', () => {
  const schema = buildToolSchema()
  const enumVals = schema.input_schema.properties.suggestedEvent.enum
  assert.deepEqual([...enumVals].sort(), [...VALID_EVENT_TYPES].sort())
  // Guardrail invariant: every enum value resolves to a real event.
  for (const t of enumVals) assert.ok(findEvent(t), `enum value ${t} must be a real event`)
})

// ---- response parser (canned fixtures) -------------------------------------

function fixtureResponse(input: unknown, name = 'narrate_round') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: 'ignored preamble' },
      { type: 'tool_use', id: 'toolu_1', name, input },
    ],
    stop_reason: 'tool_use',
  }
}

test('parseDirectorResponse extracts a well-formed tool_use block', () => {
  const parsed = parseDirectorResponse(
    fixtureResponse({
      narration: 'Stormen river i takene, men markedet står sterkt!',
      suggestedEvent: 'tax',
      reasoning: 'Lederen drar fra, en kongelig skatt jevner ut.',
    }),
  )
  assert.ok(parsed)
  assert.equal(parsed.suggestedEvent, 'tax')
  assert.equal(parsed.narration, 'Stormen river i takene, men markedet står sterkt!')
})

test('parseDirectorResponse defaults missing reasoning to empty string', () => {
  const parsed = parseDirectorResponse(
    fixtureResponse({ narration: 'Hei', suggestedEvent: 'harvest' }),
  )
  assert.ok(parsed)
  assert.equal(parsed.reasoning, '')
})

test('parseDirectorResponse returns null on junk / wrong shapes', () => {
  assert.equal(parseDirectorResponse(null), null)
  assert.equal(parseDirectorResponse('not an object'), null)
  assert.equal(parseDirectorResponse({}), null)
  assert.equal(parseDirectorResponse({ content: 'nope' }), null)
  // tool_use present but wrong tool name
  assert.equal(parseDirectorResponse(fixtureResponse({ narration: 'x', suggestedEvent: 'tax' }, 'other_tool')), null)
  // missing required fields / wrong types
  assert.equal(parseDirectorResponse(fixtureResponse({ suggestedEvent: 'tax' })), null)
  assert.equal(parseDirectorResponse(fixtureResponse({ narration: 5, suggestedEvent: 'tax' })), null)
  assert.equal(parseDirectorResponse(fixtureResponse({ narration: 'x', suggestedEvent: 42 })), null)
  // no content blocks at all
  assert.equal(parseDirectorResponse({ content: [] }), null)
})

// ---- the GUARDRAIL (resolveDirector) ---------------------------------------

test('valid suggestion is applied: validated event + sanitized narration', () => {
  const r = resolveDirector(
    RANDOM_FALLBACK,
    { narration: 'Kongen krever skatt!', suggestedEvent: 'tax', reasoning: 'Utjevning' },
    true,
  )
  assert.equal(r.suggestionApplied, true)
  assert.equal(r.event.type, 'tax')
  // The returned event is the REAL object from constants, not the suggestion text.
  assert.equal(r.event, WORLD_EVENTS.find(e => e.type === 'tax'))
  assert.equal(r.narration, 'Kongen krever skatt!')
  assert.equal(r.aiAvailable, true)
})

test('hallucinated event type outside the enum is REJECTED → random fallback', () => {
  const r = resolveDirector(
    RANDOM_FALLBACK,
    { narration: 'Meteor!', suggestedEvent: 'meteor_strike', reasoning: 'fun' },
    true,
  )
  assert.equal(r.suggestionApplied, false)
  assert.equal(r.event, RANDOM_FALLBACK) // unchanged random event
  assert.match(r.reasoning, /ugyldig/)
})

test('null suggestion (API failure) falls back to the random event, no narration', () => {
  const r = resolveDirector(RANDOM_FALLBACK, null, true)
  assert.equal(r.suggestionApplied, false)
  assert.equal(r.event, RANDOM_FALLBACK)
  assert.equal(r.narration, '')
})

test('keyless: aiAvailable false, random event, "AI ikke tilgjengelig"', () => {
  const r = resolveDirector(RANDOM_FALLBACK, null, false)
  assert.equal(r.aiAvailable, false)
  assert.equal(r.suggestionApplied, false)
  assert.equal(r.event, RANDOM_FALLBACK)
  assert.match(r.reasoning, /ikke tilgjengelig/)
})

test('narration is sanitized: control chars collapsed and length capped', () => {
  const noisy = 'Linje\n\nto\tmed   mellomrom'
  const r = resolveDirector(RANDOM_FALLBACK, { narration: noisy, suggestedEvent: 'tax', reasoning: '' }, true)
  assert.equal(r.narration, 'Linje to med mellomrom')

  const long = 'a'.repeat(500)
  const r2 = resolveDirector(RANDOM_FALLBACK, { narration: long, suggestedEvent: 'tax', reasoning: '' }, true)
  assert.ok(r2.narration.length <= 241) // 240 + ellipsis
  assert.ok(r2.narration.endsWith('…'))
})

test('the model can never inject an arbitrary event object', () => {
  // Even a suggestion that looks structurally like an event must go through findEvent.
  const r = resolveDirector(
    RANDOM_FALLBACK,
    { narration: 'x', suggestedEvent: 'gold_rush', reasoning: '' },
    true,
  )
  // Returned event is one of the canonical WORLD_EVENTS references.
  assert.ok(WORLD_EVENTS.includes(r.event))
})
