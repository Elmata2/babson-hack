/** @built F-146 tests for the tab-scoped switch request */

import { describe, expect, it } from 'vitest'

import {
  createSwitch,
  laterStage,
  STAGE_COPY,
  readStoredSwitch,
  serializeSwitch,
  stageRank,
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
