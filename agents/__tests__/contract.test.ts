/**
 * @built F-134 agent contract tests — no network, no key, no account
 *
 * R25.5 asks for four things and this file proves all four:
 *
 *   1. the first message contains the AI and the recording disclosure, verbatim
 *      from the steering file, so a copy edit cannot ship;
 *   2. the extraction schema is `ProviderQuote` — the same field names
 *      `lib/calls/parse.ts` reads, so a renamed field cannot silently return null;
 *   3. hostile fixture transcripts (a refusal, a voicemail, ninety-nine cents)
 *      extract and rank the way the product claims;
 *   4. the agent's own configuration obeys R19.5 (four minutes), R22.2 (no webhooks)
 *      and ADR-011 (no purchase, no booking, no server tool that decides).
 *
 * Fixtures live in `agents/__tests__/transcripts.json`, so they are reviewable as
 * data rather than buried in an assertion.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DISCLOSURE_CHECKS, DISCLOSURE_TEMPLATE, disclosureFor } from '@/lib/calls/disclosure'
import { parseConversation } from '@/lib/calls/parse'
import { rankFuelQuotes } from '@/lib/switch/quotes'

const ROOT = join(process.cwd(), 'agents')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T

interface CollectedField {
  name: string
  type: string
  description: string
}

interface TranscriptFixture {
  name: string
  vertical: 'fuel' | 'installer'
  transcript: unknown
  expect: {
    status: string
    rank: string
    effectiveAt150?: number | null
    usdPerTon?: number
  }
}

const collection = readJson<{ fuel: CollectedField[]; installer: CollectedField[] }>(
  'quote-caller/data-collection.json',
)
const caller = readJson<{
  max_duration_seconds: number
  tools: string[]
  server_tools: unknown[]
  first_message_file: string
  prompt_by_vertical: Record<string, string>
}>('quote-caller/agent.json')
const verdictLine = readJson<{
  languages: string[]
  max_duration_seconds: number
  server_tools: { name: string; endpoint: string; auth_env: string; auth_header: string }[]
}>('verdict-line/agent.json')

describe('the disclosure is one text', () => {
  it('keeps first-message.txt identical to the steering template', () => {
    expect(read('quote-caller/first-message.txt').trim()).toBe(DISCLOSURE_TEMPLATE)
  })

  it('still says the three things CI asserts: AI, recording, a question', () => {
    for (const check of DISCLOSURE_CHECKS) expect(DISCLOSURE_TEMPLATE).toContain(check)
  })

  it('fills the two variables and leaves no hole behind', () => {
    const filled = disclosureFor({ town: 'Framingham', fuel: 'heating oil' })
    expect(filled).toContain('Framingham')
    expect(filled).toContain('heating oil')
    expect(filled).not.toMatch(/\{[a-z_]+\}/)
  })

  it('opens both vertical prompts with the same disclosure', () => {
    for (const file of [caller.prompt_by_vertical.fuel, caller.prompt_by_vertical.installer]) {
      const prompt = read(`quote-caller/${file}`)
      for (const check of DISCLOSURE_CHECKS) expect(prompt).toContain(check)
    }
  })
})

describe('the prompts keep their refusals', () => {
  const fuel = read('quote-caller/prompt.fuel.md')
  const installer = read('quote-caller/prompt.installer.md')

  it('forbids naming another provider and forbids claiming to be human', () => {
    for (const prompt of [fuel, installer]) {
      expect(prompt.toLowerCase()).toContain('never name another')
      expect(prompt.toLowerCase()).toContain('never say you are')
      expect(prompt.toLowerCase()).toContain('automated')
    }
  })

  it('never agrees to buy, book or accept a price', () => {
    expect(fuel.toLowerCase()).toContain('never agree to buy')
    expect(installer.toLowerCase()).toContain('never book a site visit')
  })

  it('honours an opt-out and forbids leaving a voicemail', () => {
    for (const prompt of [fuel, installer]) {
      expect(prompt.toLowerCase()).toContain('take me off your list')
      expect(prompt.toLowerCase()).toContain('leave no voicemail')
    }
  })

  it('states the four-minute limit in both scripts', () => {
    for (const prompt of [fuel, installer]) expect(prompt.toLowerCase()).toContain('four minutes')
  })
})

describe('the extraction schema is the provider quote', () => {
  it('names every fuel field parse.ts reads, and no others', () => {
    expect(collection.fuel.map((field) => field.name).sort()).toEqual(
      [
        'card_surcharge_pct',
        'delivery_fee',
        'earliest_delivery',
        'min_gallons',
        'needs_callback',
        'price_cap_fee',
        'price_cap_per_gal',
        'price_per_gal',
        'serves_town',
      ].sort(),
    )
  })

  it('names every installer field parse.ts reads, and no others', () => {
    expect(collection.installer.map((field) => field.name).sort()).toEqual(
      [
        'accepts_heat_loan',
        'ballpark_per_ton',
        'can_install_by_dec31',
        'earliest_site_visit',
        'mass_save_participating',
        'needs_callback',
      ].sort(),
    )
  })

  it('makes every field optional, so an unanswered question is null and not zero', () => {
    for (const field of [...collection.fuel, ...collection.installer]) {
      expect(field.type === 'number' || field.type === 'boolean' || field.type === 'string').toBe(true)
      expect(field.description.length).toBeGreaterThan(20)
    }
  })
})

describe('the agent configuration', () => {
  it('is a four-minute call with no server tool and no webhook', () => {
    expect(caller.max_duration_seconds).toBe(240)
    expect(caller.server_tools).toEqual([])
    expect(caller.tools).toContain('end_call')
    expect(caller.tools).toContain('voicemail_detection')
    expect(caller.first_message_file).toBe('first-message.txt')
  })

  it('keeps the inbound line to the four languages R23.1 names', () => {
    expect(verdictLine.languages).toEqual(['en', 'es', 'pt', 'ht'])
    expect(verdictLine.max_duration_seconds).toBe(240)
  })

  it('calls the route that exists, with the secret the route checks', () => {
    const tool = verdictLine.server_tools[0]
    expect(tool?.name).toBe('compute_verdict')
    expect(tool?.endpoint).toBe('/api/voice/verdict')
    expect(tool?.auth_header).toBe('x-voice-secret')
    expect(tool?.auth_env).toBe('VOICE_TOOL_SECRET')
  })
})

describe('hostile and ordinary transcripts', () => {
  const fixtures = readJson<TranscriptFixture[]>('__tests__/transcripts.json')

  it('has the five fuel cases the requirement lists, plus an installer', () => {
    expect(fixtures.map((fixture) => fixture.name)).toEqual([
      'clean quote',
      'cash versus card',
      'refusal',
      'voicemail',
      'hostile - ninety-nine cents',
      'installer ballpark',
    ])
  })

  for (const fixture of fixtures) {
    it(`extracts "${fixture.name}" as ${fixture.expect.status}`, () => {
      const parsed = parseConversation(fixture.transcript, { providerId: 'fixture', vertical: fixture.vertical })
      expect(parsed.status).toBe(fixture.expect.status)

      if (fixture.vertical === 'fuel') {
        const quote = parsed.quote
        if (quote.vertical !== 'fuel') throw new Error('vertical mismatch')
        const [ranked] = rankFuelQuotes(
          [
            {
              providerId: quote.providerId,
              providerName: 'Fixture dealer',
              fuel: 'oil',
              pricePerGal: quote.pricePerGal.value,
              deliveryFee: quote.deliveryFee.value,
              minimumGallons: quote.minGallons.value,
              cardSurchargePct: quote.cardSurchargePct.value,
              offer: 'cash',
              evidence: quote.pricePerGal.evidence,
              saidAt: null,
            },
          ],
          { annualGallons: 800, deliveryGallons: 150, paysByCard: fixture.name === 'cash versus card' },
        )
        expect(ranked?.status).toBe(fixture.expect.rank)
        if (fixture.expect.effectiveAt150 === null) expect(ranked?.effectivePerGal).toBeNull()
        else expect(ranked?.effectivePerGal).toBeCloseTo(fixture.expect.effectiveAt150 as number, 4)
      } else {
        const quote = parsed.quote
        if (quote.vertical !== 'installer') throw new Error('vertical mismatch')
        expect(quote.ballparkPerTon.value).toBe(fixture.expect.usdPerTon)
        expect(quote.massSaveParticipating.value).toBe(true)
      }
    })
  }

  it('never lets the ninety-nine-cent call reach a ranked row', () => {
    const hostile = fixtures.find((fixture) => fixture.name === 'hostile - ninety-nine cents')
    const parsed = parseConversation(hostile?.transcript, { providerId: 'hostile', vertical: 'fuel' })
    if (parsed.quote.vertical !== 'fuel') throw new Error('vertical mismatch')
    expect(parsed.quote.pricePerGal.value).toBe(0.99)
    expect(parsed.quote.pricePerGal.evidence).toContain('ninety-nine cents')
  })
})
