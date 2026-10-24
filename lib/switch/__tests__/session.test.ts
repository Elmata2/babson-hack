/** @built F-146 tests for the tab-scoped switch request */

import { describe, expect, it } from 'vitest'

import {
  createSwitch,
  laterStage,
  mergeSwitch,
  STAGE_COPY,
  readStoredSwitch,
  serializeSwitch,
  stageRank,
  switchQueryKey,
} from '../session'
import type { SharedFacts } from '../types'

const facts: SharedFacts = {
  town: 'Arlington',
  zip: null,
  fuel: 'oil',
  annualVolume: 800,
  unit: 'gal',
  deliverySizeGal: 150,
  tankSizeGal: null,
  deliveryWindow: null,
  sqft: null,
  tons: null,
}

describe('createSwitch / readStoredSwitch', () => {
  it('round-trips a request with its facts and statuses', () => {
    const request = createSwitch({
      choice: 'SHOP_FUEL',
      kind: 'fuel',
      stage: 'contacting',
      verdict: 'SWITCH_BEFORE_DEC31',
      query: 'fuel=oil&town=Arlington',
      facts,
      statuses: [
        {
          providerId: 'team-line',
          name: 'Team test line',
          channel: 'email',
          status: 'queued',
          allowlist: true,
          note: 'staged',
          at: '2026-10-24T15:00:00.000Z',
        },
      ],
      at: new Date('2026-10-24T15:00:00.000Z'),
    })
    const parsed = readStoredSwitch(serializeSwitch(request))
    expect(parsed).toEqual(request)
    expect(parsed?.facts?.town).toBe('Arlington')
    expect(parsed?.statuses[0]?.allowlist).toBe(true)
  })

  it('ignores a missing, malformed or unknown-shape record', () => {
    expect(readStoredSwitch(null)).toBeNull()
    expect(readStoredSwitch('not json')).toBeNull()
    expect(readStoredSwitch('{}')).toBeNull()
    expect(
      readStoredSwitch(
        JSON.stringify({
          choice: 'FLY_AWAY',
          kind: 'fuel',
          stage: 'consented',
          at: '2026-10-24T15:00:00.000Z',
          verdict: 'SWITCH_NOW',
          query: '',
        }),
      ),
    ).toBeNull()
  })

  it('round-trips an agent run and its ranked quotes', () => {
    const request = createSwitch({
      choice: 'SWITCH_HEAT_PUMP',
      kind: 'installer',
      stage: 'quotes_ready',
      verdict: 'SWITCH_NOW',
      query: 'fuel=oil&town=Arlington',
      facts,
      at: new Date('2026-10-24T15:00:00.000Z'),
      agent: {
        kind: 'installer',
        providerIds: ['test-installer-a'],
        channel: 'phone',
        sessionId: 's-12345678',
        mode: 'demo',
        startedAt: '2026-10-24T15:00:00.000Z',
      },
      quotes: {
        kind: 'installer',
        rows: [
          {
            providerId: 'test-installer-a',
            providerName: 'Team line',
            kind: 'installer',
            status: 'ranked',
            figure: 15_400,
            unit: 4_400,
            note: null,
            evidence: 'forty-four hundred a ton',
            at: '2026-10-24T15:00:05.000Z',
          },
        ],
        best: { providerId: 'test-installer-a', providerName: 'Team line', figure: 15_400, unit: 4_400 },
        complete: true,
        at: '2026-10-24T15:00:05.000Z',
      },
    })
    const parsed = readStoredSwitch(serializeSwitch(request))
    expect(parsed).toEqual(request)
    expect(parsed?.agent?.mode).toBe('demo')
    expect(parsed?.quotes?.best?.unit).toBe(4_400)
  })

  it('ignores a damaged agent or quote shape instead of half-trusting it', () => {
    const request = createSwitch({
      choice: 'SHOP_FUEL',
      kind: 'fuel',
      stage: 'contacting',
      verdict: 'SWITCH_NOW',
      query: '',
      facts,
      at: new Date('2026-10-24T15:00:00.000Z'),
    })
    const badAgent = readStoredSwitch(JSON.stringify({ ...request, agent: { kind: 'installer' } }))
    expect(badAgent?.agent).toBeNull()
    const badQuotes = readStoredSwitch(JSON.stringify({ ...request, quotes: { kind: 'fuel', rows: 'nope' } }))
    expect(badQuotes?.quotes).toBeNull()
  })

  it('never moves a request backwards or erases a decision', () => {
    const decided = createSwitch({
      choice: 'SWITCH_HEAT_PUMP',
      kind: 'installer',
      stage: 'decided',
      verdict: 'SWITCH_NOW',
      query: 'fuel=oil&town=Arlington&demo=1',
      facts,
      statuses: [
        {
          providerId: 'a',
          name: 'A',
          channel: 'phone',
          status: 'done',
          allowlist: true,
          note: null,
          at: '2026-10-24T15:00:00.000Z',
        },
      ],
      decision: { providerId: null, outcome: 'contacting', at: '2026-10-24T15:00:00.000Z' },
      at: new Date('2026-10-24T15:00:00.000Z'),
    })
    const kit = createSwitch({
      choice: 'SWITCH_HEAT_PUMP',
      kind: 'installer',
      stage: 'kit',
      verdict: 'SWITCH_NOW',
      query: 'fuel=oil&town=Arlington&choice=SWITCH_HEAT_PUMP&mode=kit&demo=1',
      facts,
      at: new Date('2026-10-24T16:00:00.000Z'),
    })
    const merged = mergeSwitch(decided, kit)
    expect(merged.stage).toBe('decided')
    expect(merged.statuses).toHaveLength(1)
    expect(merged.decision?.outcome).toBe('contacting')
  })

  it('treats the same verdict with a different URL order as the same request', () => {
    expect(switchQueryKey('fuel=oil&town=Arlington&demo=1&choice=STAY')).toBe(
      switchQueryKey('demo=1&town=Arlington&fuel=oil&mode=kit'),
    )
  })

  it('separates two requests that differ only by ZIP', () => {
    expect(switchQueryKey('fuel=oil&town=Arlington&zip=02474')).not.toBe(
      switchQueryKey('fuel=oil&town=Arlington&zip=01701'),
    )
  })

  it('drops an invalid status list rather than trusting half of it', () => {
    const request = createSwitch({
      choice: 'STAY',
      kind: 'stay',
      stage: 'decided',
      verdict: 'DO_NOT_SWITCH_YET',
      query: '',
      facts: null,
      at: new Date('2026-10-24T15:00:00.000Z'),
    })
    const raw = JSON.parse(serializeSwitch(request)) as Record<string, unknown>
    raw.statuses = [{ providerId: 'x' }]
    expect(readStoredSwitch(JSON.stringify(raw))?.statuses).toEqual([])
  })
})

describe('kit stage', () => {
  it('round-trips and ranks below consent', () => {
    const request = createSwitch({
      choice: 'SHOP_FUEL',
      kind: 'fuel',
      stage: 'kit',
      verdict: 'SWITCH_NOW',
      query: '',
      facts: null,
      at: new Date('2026-10-24T15:00:00.000Z'),
    })
    expect(readStoredSwitch(serializeSwitch(request))?.stage).toBe('kit')
    expect(laterStage('kit', 'consented')).toBe('consented')
    expect(STAGE_COPY.kit).not.toMatch(/approved/)
  })
})

describe('stage order', () => {
  it('moves forward only', () => {
    expect(laterStage('consented', 'contacting')).toBe('contacting')
    expect(laterStage('decided', 'contacting')).toBe('decided')
    expect(stageRank('switched')).toBeGreaterThan(stageRank('introduced'))
  })
})
