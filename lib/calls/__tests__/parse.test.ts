/**
 * @built F-125 the parse boundary, tested with the payloads that should worry us
 *
 * Three kinds of input: a well-formed conversation, a hostile one (a provider says
 * something absurd, or the vendor changes shape), and a truncated one. The rule
 * under test is the same in all three: nothing throws, nothing is invented, and a
 * value that came from a stranger always carries the sentence it came from.
 */

import { describe, expect, it } from 'vitest'

import { parseConversation, redactExcerpt, normaliseStatus } from '../parse'

const ctx = { providerId: 'test-fuel-a', vertical: 'fuel' as const }

const goodConversation = {
  status: 'done',
  metadata: { call_duration_secs: 96.4 },
  transcript: [
    { role: 'agent', message: 'Hi, this is an automated AI assistant calling on behalf of a homeowner in Framingham.' },
    { role: 'user', message: 'Five seventy-nine a gallon, cash. Card is two and a half percent more.' },
  ],
  analysis: {
    data_collection_results: {
      price_per_gal: { value: 5.79, rationale: '"Five seventy-nine a gallon"' },
      delivery_fee: { value: 0, rationale: '"No delivery charge"' },
      min_gallons: { value: 150, rationale: '"A hundred and fifty minimum"' },
      card_surcharge_pct: { value: 2.5, rationale: 'two and a half percent' },
      earliest_delivery: { value: '2026-10-27', rationale: 'Tuesday' },
      serves_town: { value: true, rationale: 'we deliver in Framingham' },
      needs_callback: { value: false, rationale: null },
    },
  },
}

describe('parseConversation', () => {
  it('reads a well-formed conversation into a typed, cited quote', () => {
    const parsed = parseConversation(goodConversation, ctx)
    expect(parsed.status).toBe('done')
    expect(parsed.durationSeconds).toBe(96)
    expect(parsed.quote.vertical).toBe('fuel')
    if (parsed.quote.vertical !== 'fuel') throw new Error('unreachable')
    expect(parsed.quote.pricePerGal).toEqual({ value: 5.79, evidence: '"Five seventy-nine a gallon"' })
    expect(parsed.quote.earliestDelivery.value).toBe('2026-10-27')
    expect(parsed.excerpts).toHaveLength(2)
    expect(parsed.excerpts[0]?.speaker).toBe('agent')
  })

  it('keeps a hostile price as a number, so the ranking gate can reject it', () => {
    const parsed = parseConversation(
      {
        status: 'done',
        analysis: {
          data_collection_results: {
            price_per_gal: { value: '$0.99', rationale: '"ninety-nine cents a gallon"' },
          },
        },
      },
      ctx,
    )
    if (parsed.quote.vertical !== 'fuel') throw new Error('unreachable')
    // Parsed faithfully — $0.99 is what was said. `rankFuelQuotes` is what refuses it.
    expect(parsed.quote.pricePerGal.value).toBe(0.99)
    expect(parsed.quote.pricePerGal.evidence).toContain('ninety-nine cents')
  })

  it('turns an unreadable value into null, never into zero', () => {
    const parsed = parseConversation(
      {
        status: 'done',
        analysis: {
          data_collection_results: {
            price_per_gal: { value: 'call me back', rationale: null },
            min_gallons: { value: null },
            earliest_delivery: { value: 'Tuesday-ish' },
            serves_town: { value: 'maybe' },
          },
        },
      },
      ctx,
    )
    if (parsed.quote.vertical !== 'fuel') throw new Error('unreachable')
    expect(parsed.quote.pricePerGal.value).toBeNull()
    expect(parsed.quote.minGallons.value).toBeNull()
    expect(parsed.quote.earliestDelivery.value).toBeNull()
    expect(parsed.quote.servesTown.value).toBeNull()
  })

  it('survives a payload that is not a conversation at all', () => {
    for (const raw of [null, 42, 'a string', [], { transcript: 'not an array' }]) {
      const parsed = parseConversation(raw, ctx)
      expect(parsed.status).toBe('in_progress')
      expect(parsed.excerpts).toEqual([])
      expect(parsed.quote.vertical).toBe('fuel')
    }
  })

  it('parses the installer vertical with its own fields and no fuel ones', () => {
    const parsed = parseConversation(
      {
        status: 'done',
        analysis: {
          data_collection_results: {
            mass_save_participating: { value: true },
            accepts_heat_loan: { value: 'yes' },
            can_install_by_dec31: { value: true },
            ballpark_per_ton: { value: 4400 },
          },
        },
      },
      { providerId: 'test-installer-a', vertical: 'installer' },
    )
    if (parsed.quote.vertical !== 'installer') throw new Error('unreachable')
    expect(parsed.quote.massSaveParticipating.value).toBe(true)
    expect(parsed.quote.acceptsHeatLoan.value).toBe(true)
    expect(parsed.quote.ballparkPerTon.value).toBe(4400)
  })

  it('marks a callback request, which changes the wording, not the rank', () => {
    const parsed = parseConversation(
      { status: 'done', data_collection_results: { needs_callback: { value: true } } },
      ctx,
    )
    expect(parsed.needsCallback).toBe(true)
    expect(parsed.quote.needsCallback).toBe(true)
  })

  it('caps the transcript at six turns and 240 characters a turn', () => {
    const parsed = parseConversation(
      {
        status: 'done',
        transcript: Array.from({ length: 12 }, (_, index) => ({ role: 'user', message: `turn ${index} ${'x'.repeat(400)}` })),
      },
      ctx,
    )
    expect(parsed.excerpts).toHaveLength(6)
    for (const turn of parsed.excerpts) expect(turn.text.length).toBeLessThanOrEqual(240)
    expect(parsed.excerpts[5]?.text.startsWith('turn 11')).toBe(true)
  })
})

describe('redaction', () => {
  it('masks an email and a phone number said out loud', () => {
    expect(redactExcerpt('Call me on (508) 555-0101 or me@dealer.example')).toBe(
      'Call me on [redacted] or [redacted]',
    )
  })

  it('collapses whitespace so a transcript cannot inject layout', () => {
    expect(redactExcerpt('a\n\n   b\tc')).toBe('a b c')
  })
})

describe('normaliseStatus', () => {
  it('maps platform spellings into the closed set', () => {
    expect(normaliseStatus('in-progress')).toBe('in_progress')
    expect(normaliseStatus('completed')).toBe('done')
    expect(normaliseStatus('no-answer')).toBe('no_answer')
    expect(normaliseStatus('something new')).toBe('in_progress')
    expect(normaliseStatus(undefined)).toBe('in_progress')
  })
})
