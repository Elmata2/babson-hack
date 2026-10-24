/** @built F-150 the dashboard's state machine, tested without a browser */

import { describe, expect, it } from 'vitest'

import {
  choiceLabel,
  dashboardNext,
  dashboardSteps,
  decisionCopy,
  verdictLabel,
} from '../dashboard'
import { createSwitch } from '../session'
import type { SharedFacts, StoredSwitch } from '../types'

const facts: SharedFacts = {
  town: 'Framingham',
  zip: null,
  fuel: 'oil',
  annualVolume: 900,
  unit: 'gal',
  deliverySizeGal: 150,
  tankSizeGal: null,
  deliveryWindow: null,
  sqft: null,
  tons: 3.5,
}

function request(over: Partial<StoredSwitch> = {}): StoredSwitch {
  return {
    ...createSwitch({
      choice: 'SWITCH_HEAT_PUMP',
      kind: 'installer',
      stage: 'consented',
      verdict: 'SWITCH_BEFORE_DEC31',
      query: 'fuel=oil&units=900&price=6.23&town=Framingham&demo=1',
      facts,
      at: new Date('2026-10-24T15:00:00.000Z'),
    }),
    ...over,
  }
}

describe('dashboard labels', () => {
  it('never renders raw verdict or choice enums', () => {
    expect(verdictLabel('SWITCH_BEFORE_DEC31')).toBe('Before 31 Dec')
    expect(verdictLabel('UNKNOWN')).toBe('Not recorded')
    expect(choiceLabel(request())).toBe('Get heat pump quotes')
  })
})

describe('dashboardSteps', () => {
  it('shows the kit as one task, not a six-step journey', () => {
    const steps = dashboardSteps(request({ stage: 'kit' }))
    expect(steps.steps).toHaveLength(1)
    expect(steps.current).toBe(0)
  })

  it('shows a stay decision as one completed step', () => {
    const steps = dashboardSteps(request({ choice: 'STAY', kind: 'stay', stage: 'decided' }))
    expect(steps.steps).toHaveLength(1)
    expect(steps.steps[0].label).toContain('stayed')
  })

  it('walks consent -> calls -> quotes -> decision for an agent run', () => {
    expect(dashboardSteps(request({ stage: 'consented' })).current).toBe(0)
    expect(dashboardSteps(request({ stage: 'contacting' })).current).toBe(1)
    expect(dashboardSteps(request({ stage: 'quotes_ready' })).current).toBe(2)
    expect(dashboardSteps(request({ stage: 'decided' })).current).toBe(3)
  })
})

describe('dashboardNext', () => {
  it('sends an empty browser to the bills', () => {
    const next = dashboardNext({ request: null, profile: null, demo: false })
    expect(next.action?.href).toBe('/onboarding')
    expect(next.title).toContain('two bills')
  })

  it('uses the stored verdict when the profile can rebuild one', () => {
    const next = dashboardNext({
      request: null,
      profile: { town: 'Framingham', verdictHref: '/verdict?fuel=oil&units=900&price=6.23&town=Framingham' },
      demo: false,
    })
    expect(next.action?.label).toBe('See your verdict')
    expect(next.action?.href).toContain('/verdict?')
  })

  it('offers the agent from a kit request', () => {
    const next = dashboardNext({ request: request({ stage: 'kit' }), profile: null, demo: true })
    expect(next.action?.label).toBe('Let the agent call')
    expect(next.action?.href).toContain('agent=1')
  })

  it('does not auto-start a call for an email-only consent', () => {
    const email = request({
      stage: 'consented',
      agent: {
        kind: 'installer',
        providerIds: ['a', 'b'],
        channel: 'email',
        sessionId: 's-1',
        mode: 'allowlist',
        startedAt: '2026-10-24T15:00:00.000Z',
      },
    })
    const next = dashboardNext({ request: email, profile: null, demo: false })
    expect(next.action?.label).toBe('Reopen the consent screen')
    expect(next.action?.href).not.toContain('agent=1')
  })

  it('resumes a phone consent', () => {
    const phone = request({
      stage: 'consented',
      agent: {
        kind: 'installer',
        providerIds: ['a', 'b'],
        channel: 'phone',
        sessionId: 's-1',
        mode: 'demo',
        startedAt: '2026-10-24T15:00:00.000Z',
      },
    })
    const next = dashboardNext({ request: phone, profile: null, demo: true })
    expect(next.action?.label).toBe('Resume the agent')
    expect(next.action?.href).toContain('agent=1')
  })

  it('writes the best fuel price back into the verdict', () => {
    const quotes = request({
      stage: 'quotes_ready',
      choice: 'SHOP_FUEL',
      kind: 'fuel',
      quotes: {
        kind: 'fuel',
        rows: [],
        best: { providerId: 'd1', providerName: 'Dealer', figure: 4_500, unit: 5.79 },
        complete: true,
        at: '2026-10-24T15:00:00.000Z',
      },
    })
    const next = dashboardNext({ request: quotes, profile: null, demo: false })
    expect(next.action?.label).toBe('Use the best price')
    expect(next.action?.href).toContain('price=5.79')
  })

  it('keeps a stay verdict on the stay branch', () => {
    const next = dashboardNext({
      request: request({ choice: 'STAY', kind: 'stay', stage: 'decided' }),
      profile: null,
      demo: false,
    })
    expect(next.eyebrow).toContain('stay')
    expect(next.action?.href).toContain('/verdict?')
  })
})

describe('decisionCopy', () => {
  it('does not call staying a decline', () => {
    const copy = decisionCopy(
      request({
        choice: 'STAY',
        kind: 'stay',
        stage: 'decided',
        decision: { providerId: null, outcome: 'declined', at: '2026-10-24T15:00:00.000Z' },
      }),
    )
    expect(copy).toBe('You chose to stay as you are.')
  })

  it('does not call a supply check a provider contact', () => {
    const copy = decisionCopy(
      request({
        choice: 'SHOP_SUPPLY',
        kind: 'supply',
        stage: 'decided',
        decision: { providerId: null, outcome: 'checked', at: '2026-10-24T15:00:00.000Z' },
      }),
    )
    expect(copy).toContain('compared your supply line')
  })
})
