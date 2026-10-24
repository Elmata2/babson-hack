/**
 * @built F-127 the board — one comparable number, and the flags that change a decision
 * @built F-129 the replay's staged timing, checked at the moments the demo uses
 * @built F-122 the committed directory cannot pretend to be a business
 * @built F-123 what this deployment may dial, and what it refuses
 * @built F-124 the route's gate, exercised with no key and no network
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildBoard, fuelQuoteFrom } from '../board'
import { demoDurationMs, demoRecords, fixtureRecord, isDemoConversationId } from '../fixtures'
import { voiceReadiness } from '../readiness'
import { parseConversation } from '../parse'
import { agentReady, callPlan, dialable, isE164 } from '../plan'
import { callVariables, parseRefs } from '../route-model'
import type { CallRecord, FuelQuoteWire } from '../types'
import { directoryForKind, seedProviders } from '@/lib/switch/directory'
import type { SwitchProvider } from '@/lib/switch/types'

const STARTED = '2026-10-24T15:00:00.000Z'
const usage = { annualGallons: 800, deliveryGallons: 150, paysByCard: false, tons: 3, averagePerGal: 6.23 }

function wire(overrides: Partial<FuelQuoteWire> = {}): FuelQuoteWire {
  return {
    vertical: 'fuel',
    providerId: 'p',
    pricePerGal: { value: 5.79, evidence: '"five seventy-nine"' },
    cardSurchargePct: { value: null, evidence: null },
    minGallons: { value: 150, evidence: null },
    deliveryFee: { value: 0, evidence: null },
    priceCapPerGal: { value: null, evidence: null },
    priceCapFee: { value: null, evidence: null },
    earliestDelivery: { value: '2026-10-27', evidence: null },
    servesTown: { value: true, evidence: null },
    needsCallback: false,
    ...overrides,
  }
}

function recordFor(providerId: string, quote: FuelQuoteWire | null, status: CallRecord['status'] = 'done'): CallRecord {
  return {
    providerId,
    providerName: providerId,
    vertical: 'fuel',
    conversationId: `conv-${providerId}`,
    status,
    at: STARTED,
    durationSeconds: 90,
    excerpts: [],
    quote,
    needsCallback: false,
    note: null,
  }
}

describe('buildBoard', () => {
  it('shows the best ranked dealer with its annual cost and the yardstick', () => {
    const board = buildBoard(
      [
        recordFor('a', wire({ providerId: 'a' })),
        recordFor('b', wire({ providerId: 'b', pricePerGal: { value: 6.05, evidence: null }, deliveryFee: { value: 25, evidence: null }, minGallons: { value: 200, evidence: null } })),
      ],
      usage,
    )
    expect(board.best?.providerId).toBe('a')
    expect(board.best?.figure).toBeCloseTo(5.79 * 800, 2)
    expect(board.best?.versusAverage?.perGal).toBeCloseTo(-0.44, 2)
    expect(board.best?.versusAverage?.annual).toBeCloseTo(-352, 0)
    expect(board.fuel.map((row) => row.providerId)).toEqual(['a', 'b'])
    expect(board.fuel[1]?.note).toContain('Minimum delivery is 200 gal')
  })

  it('never promotes an implausible price to best', () => {
    const board = buildBoard([recordFor('hostile', wire({ providerId: 'hostile', pricePerGal: { value: 0.99, evidence: '"ninety-nine cents"' } }))], usage)
    expect(board.best).toBeNull()
    expect(board.fuel[0]?.status).toBe('unverified')
    expect(board.fuel[0]?.annualCost).toBeNull()
  })

  it('leaves the annual cost out rather than inventing one without a volume', () => {
    const board = buildBoard([recordFor('a', wire({ providerId: 'a' }))], { ...usage, annualGallons: null })
    expect(board.fuel[0]?.status).toBe('ranked')
    expect(board.fuel[0]?.annualCost).toBeNull()
    expect(board.best?.versusAverage).toBeNull()
  })

  it('ranks an installer by total at the estimated tons', () => {
    const board = buildBoard(
      [
        {
          ...recordFor('inst', null),
          vertical: 'installer',
          quote: {
            vertical: 'installer',
            providerId: 'inst',
            massSaveParticipating: { value: true, evidence: null },
            acceptsHeatLoan: { value: true, evidence: null },
            earliestSiteVisit: { value: '2026-11-03', evidence: null },
            canInstallByDec31: { value: true, evidence: null },
            ballparkPerTon: { value: 4_400, evidence: '"forty-four hundred a ton"' },
            needsCallback: false,
          },
        },
      ],
      usage,
    )
    expect(board.best?.kind).toBe('installer')
    expect(board.best?.figure).toBe(13_200)
    expect(board.installers[0]?.note).toContain('Ballpark')
  })

  it('reports who asked for the callback and when the round is over', () => {
    const done = { ...recordFor('a', wire()), needsCallback: true }
    expect(buildBoard([done], usage).callbacks).toEqual(['a'])
    expect(buildBoard([done], usage).complete).toBe(true)
    expect(buildBoard([{ ...done, status: 'in_progress', quote: null }], usage).complete).toBe(false)
  })

  it('maps a wire quote into the ranking vocabulary without inventing a cash price', () => {
    expect(fuelQuoteFrom(wire({ pricePerGal: { value: null, evidence: null }, priceCapPerGal: { value: 5.49, evidence: 'cap' } }), 'A').offer).toBe('prebuy')
    expect(fuelQuoteFrom(wire(), 'A').offer).toBe('cash')
  })
})

describe('the demo replay', () => {
  it('stages the three conversations forward and never backwards', () => {
    const moments = [0, 300, 1_400, 8_400, 12_000, demoDurationMs()]
    const statusRank: Record<string, number> = { queued: 0, ringing: 1, in_progress: 2, done: 3 }
    for (let index = 1; index < moments.length; index += 1) {
      const previous = demoRecords(moments[index - 1] as number, STARTED)
      const current = demoRecords(moments[index] as number, STARTED)
      for (const [position, record] of current.entries()) {
        const before = previous[position] as CallRecord
        expect(statusRank[record.status]).toBeGreaterThanOrEqual(statusRank[before.status] as number)
      }
    }
  })

  it('has all three quotes only at the end, and the fixture beat stays under 20s', () => {
    expect(demoRecords(0, STARTED).every((record) => record.quote === null)).toBe(true)
    const finished = demoRecords(demoDurationMs(), STARTED)
    expect(finished.every((record) => record.quote !== null)).toBe(true)
    expect(finished.every((record) => record.status === 'done')).toBe(true)
    expect(demoDurationMs()).toBeLessThan(20_000)
    expect(fixtureRecord('test-fuel-a', demoDurationMs(), STARTED)?.quote).not.toBeNull()
    expect(fixtureRecord('not-in-the-replay', 0, STARTED)).toBeNull()
  })

  it('keeps every replay id out of the vendor path', () => {
    expect(isDemoConversationId('demo-fuel-a')).toBe(true)
    expect(isDemoConversationId('conv_abc123')).toBe(false)
  })

  it('files the demo board under the same gate as a live one', () => {
    const board = buildBoard(demoRecords(demoDurationMs(), STARTED), usage)
    expect(board.best?.providerId).toBe('test-fuel-a')
    expect(board.fuel.filter((row) => row.status === 'ranked')).toHaveLength(2)
    expect(board.negotiation).toBeNull() // both dealers quoted, so there is nobody to re-ask
  })
})

describe('the committed directory', () => {
  const seed = seedProviders()

  it('loads the seed and marks every row a test line', () => {
    expect(seed.length).toBeGreaterThan(0)
    for (const provider of seed) {
      expect(provider.allowlist).toBe(true)
      expect(provider.source).toContain('Team allowlist')
      expect(provider.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('uses only the reserved fiction range, so no reader can dial a stranger', () => {
    for (const provider of seed) {
      if (!provider.phone) continue
      expect(provider.phone).toMatch(/^\+15550100\d{3}$/)
    }
  })

  it('narrows a row with towns to those towns and leaves an unrestricted row alone', () => {
    const framingham = directoryForKind('fuel', 'Framingham')
    const worcester = directoryForKind('fuel', 'Worcester')
    expect(framingham.map((row) => row.id)).toContain('test-fuel-a')
    expect(worcester.map((row) => row.id)).not.toContain('test-fuel-a')
    expect(worcester.map((row) => row.id)).toContain('test-fuel-b')
  })

  it('never lists an installer under fuel, or the reverse', () => {
    expect(directoryForKind('installer', 'Framingham').every((row) => row.kind === 'installer')).toBe(true)
    expect(directoryForKind('fuel', 'Framingham').every((row) => row.kind === 'fuel')).toBe(true)
  })
})

describe('the call plan', () => {
  const line: SwitchProvider = {
    id: 'test-fuel-a',
    name: 'Team test line — fuel A',
    kind: 'fuel',
    channels: ['phone'],
    phone: '+15550100001',
    email: null,
    source: 'Team allowlist',
    asOf: '2026-10-24',
    allowlist: true,
  }
  const real: SwitchProvider = { ...line, id: 'real', name: 'Real dealer', phone: '+16175550100', allowlist: false }

  it('is off with no agent configured, and says so', () => {
    const plan = callPlan([line], {} as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('off')
    expect(plan.reason).toContain('switch kit')
    expect(agentReady(plan.agent)).toBe(false)
  })

  it('dials only team lines unless the outreach switch is on', () => {
    const env = {
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'a',
      ELEVENLABS_PHONE_NUMBER_ID: 'p',
    } as unknown as NodeJS.ProcessEnv
    const guarded = callPlan([line, real], env)
    expect(guarded.mode).toBe('allowlist')
    expect(dialable(line, guarded).ok).toBe(true)
    expect(dialable(real, guarded)).toMatchObject({ ok: false })

    const live = callPlan([line, real], { ...env, PROVIDER_OUTREACH_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)
    expect(live.mode).toBe('live')
    expect(dialable(real, live).ok).toBe(true)
  })

  it('honours the legacy dial-only flag, so an older deployment keeps calling', () => {
    const env = {
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'a',
      ELEVENLABS_PHONE_NUMBER_ID: 'p',
      PROVIDER_CALLS_ENABLED: 'true',
    } as unknown as NodeJS.ProcessEnv
    expect(callPlan([line, real], env).mode).toBe('live')
  })

  it('names nothing a household cannot act on, and leaves the variable names to the operator tools', () => {
    const plan = callPlan([line], { ELEVENLABS_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)
    expect(plan.mode).toBe('off')
    expect(plan.reason).toContain('switch kit')
    expect(plan.reason).not.toContain('ELEVENLABS')
    expect(voiceReadiness({ ELEVENLABS_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv).missing).toEqual([
      'ELEVENLABS_AGENT_ID',
      'ELEVENLABS_PHONE_NUMBER_ID',
      'PROVIDER_OUTREACH_ENABLED',
    ])
  })

  it('refuses a row with no phone, and a number that is not E.164', () => {
    const plan = callPlan([line], {
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'a',
      ELEVENLABS_PHONE_NUMBER_ID: 'p',
      PROVIDER_CALLS_ENABLED: 'true',
    } as unknown as NodeJS.ProcessEnv)
    expect(dialable({ ...real, phone: null }, plan)).toMatchObject({ ok: false })
    expect(isE164('+15550100001')).toBe(true)
    expect(isE164('555-0100')).toBe(false)
    expect(isE164(null)).toBe(false)
  })
})

describe('route plumbing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads at most six calls, and a bare id names itself', () => {
    const url = new URL('https://example.test/api/calls/s?call=conv1:test-fuel-a&call=conv2')
    expect(parseRefs(url)).toEqual([
      { conversationId: 'conv1', providerId: 'test-fuel-a' },
      { conversationId: 'conv2', providerId: 'conv2' },
    ])
    const many = new URLSearchParams()
    for (let index = 0; index < 9; index += 1) many.append('call', `c${index}`)
    expect(parseRefs(new URL(`https://example.test/api/calls/s?${many.toString()}`)).length).toBe(6)
  })

  it('hands the agent the closed fact list and nothing else', () => {
    const variables = callVariables({
      town: 'Framingham',
      zip: null,
      fuel: 'oil',
      annualVolume: 800,
      unit: 'gal',
      deliverySizeGal: 150,
      tankSizeGal: null,
      deliveryWindow: null,
      sqft: null,
      tons: null,
    })
    expect(variables).toEqual({
      town: 'Framingham',
      fuel: 'oil',
      annual_volume: '800',
      unit: 'gal',
      delivery_size_gal: '150',
    })
    expect(Object.keys(variables)).not.toContain('zip')
  })
})

describe('parseConversation on a truncated payload', () => {
  it('still reports the status it has and an empty quote, not a crash', () => {
    const parsed = parseConversation({ status: 'in-progress' }, { providerId: 'x', vertical: 'fuel' })
    expect(parsed.status).toBe('in_progress')
    expect(parsed.excerpts).toEqual([])
    if (parsed.quote.vertical === 'fuel') expect(parsed.quote.pricePerGal.value).toBeNull()
  })
})
