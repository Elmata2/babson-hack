import { describe, expect, it } from 'vitest'

import type { OptionInput } from '@/lib/switch/option-cards'
import type { SwitchChoice } from '@/lib/switch/types'
import { BY_VERDICT } from './fixtures'
import { recommend } from '../recommendation'
import { buildReminderIcs } from '../reminder'
import { verdictPath } from '../share-query'

const ALL: SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']

function option(result: OptionInput['result'], over: Partial<OptionInput> = {}): OptionInput {
  return {
    result,
    fuel: result.fuel,
    unitPrice: result.unitPrice,
    annualUnits: result.annualUnits,
    market: { price: null, period: null },
    basic: null,
    noMassSave: false,
    town: 'Framingham',
    plan: { mode: 'off' },
    reachable: { fuel: 0, installer: 0 },
    ...over,
  }
}

describe('recommend never carries personal data', () => {
  const result = BY_VERDICT.SWITCH_NOW[0]!.result
  const query = 'fuel=oil&units=800&addr=12+Elm+St&mn=my+note&town=Framingham'

  it('drops addr and mn from every link', () => {
    const rec = recommend({ option: option(result), choices: ALL, query })
    const links = [
      ...(rec.kind === 'quotes' ? [rec.agentHref, rec.kitHref] : []),
      ...rec.others.map((other) => other.href),
    ]
    expect(links.length).toBeGreaterThan(3)
    for (const link of links) {
      expect(link).not.toMatch(/addr|mn=|Elm|note/)
      expect(link).toContain('town=Framingham')
    }
  })

  it('builds the reminder URL from the allowlist', () => {
    const ics = buildReminderIcs(`https://x.test${verdictPath(query)}`, new Date('2026-10-24T00:00:00Z'))
    expect(ics.replace(/\r\n /g, '')).toContain('town=Framingham')
    expect(ics).not.toMatch(/addr|mn=|Elm/)
  })
})

describe('recommend', () => {
  const hold = BY_VERDICT.DO_NOT_SWITCH_YET[0]!.result
  const now = BY_VERDICT.SWITCH_NOW[0]!.result
  const deadline = BY_VERDICT.SWITCH_BEFORE_DEC31[0]!.result

  it('recommends staying and a January 2027 reminder when the money does not work', () => {
    const rec = recommend({ option: option(hold), choices: ['STAY', 'SWITCH_HEAT_PUMP'], query: 'fuel=gas' })
    expect(rec.kind).toBe('stay')
    expect(rec.headline).toBe(
      'Our recommendation: stay with what you have. Check again in January 2027, when prices and rebates reset.',
    )
    if (rec.kind === 'stay') expect(rec.reminderLabel).toBe('Add a reminder for January 2027')
    expect(rec.secondary).toBeNull()
    expect(rec.others.map((o) => o.label)).toEqual(['Get heat pump quotes'])
  })

  it('sends a light plant town to its own programs, never to a January 2027 recheck', () => {
    for (const result of [now, hold, deadline]) {
      const rec = recommend({
        option: option(result, { noMassSave: true, town: 'Wellesley' }),
        choices: ['STAY', 'SHOP_FUEL', 'SWITCH_HEAT_PUMP'],
        query: 'town=Wellesley',
      })
      expect(rec.kind).toBe('light_plant')
      expect(rec.headline).toBe(
        'Mass Save rebates don’t apply in Wellesley: your light plant sets its own programs. Ask your light plant what it offers for heat pumps. The number is on your electric bill.',
      )
      expect(rec.headline).not.toMatch(/January 2027|reset/)
      expect('reminderLabel' in rec).toBe(false)
      expect(rec.others.map((o) => o.choice)).not.toContain('STAY')
    }
  })

  it('adds one fuel line only when the household pays above the state average', () => {
    const above = recommend({
      option: option(hold, { fuel: 'oil', unitPrice: 6.23, annualUnits: 800, market: { price: 4.1, period: '2026-10-19' } }),
      choices: ['STAY', 'SHOP_FUEL', 'SWITCH_HEAT_PUMP'],
      query: 'fuel=oil&town=Boston',
    })
    expect(above.secondary?.text).toContain('$2.13/gal above the state oil average')
    expect(above.secondary?.text).toContain('about $1,704 a year')
    expect(above.secondary?.href).toBe('/switch?fuel=oil&town=Boston&choice=SHOP_FUEL')

    const below = recommend({
      option: option(hold, { fuel: 'oil', unitPrice: 3.9, market: { price: 4.1, period: null } }),
      choices: ['STAY', 'SHOP_FUEL', 'SWITCH_HEAT_PUMP'],
      query: '',
    })
    expect(below.secondary).toBeNull()

    const noDealer = recommend({
      option: option(hold, { unitPrice: 6.23, market: { price: 4.1, period: null } }),
      choices: ['STAY', 'SWITCH_HEAT_PUMP'],
      query: '',
    })
    expect(noDealer.secondary).toBeNull()
  })

  it('recommends quotes now with the agent and kit links for SWITCH_NOW', () => {
    const rec = recommend({ option: option(now), choices: ALL, query: 'fuel=oil' })
    expect(rec.kind).toBe('quotes')
    expect(rec.headline).toBe('Our recommendation: get heat pump quotes now')
    if (rec.kind !== 'quotes') throw new Error('expected quotes')
    expect(rec.agentHref).toBe('/switch?fuel=oil&choice=SWITCH_HEAT_PUMP')
    expect(rec.kitHref).toBe('/switch?fuel=oil&choice=SWITCH_HEAT_PUMP&mode=kit')
    expect(rec.others.map((o) => o.label)).toEqual(['Stay as you are', 'Shop heating fuel', 'Shop electricity supply'])
    expect(rec.others[2]?.href).toBe('/switch?fuel=oil&choice=SHOP_SUPPLY')
  })

  it('names the rebate drop for the deadline case', () => {
    const rec = recommend({ option: option(deadline), choices: ALL, query: '' })
    expect(rec.headline).toContain('now, before 31 December. The rebate drops by $')
    expect(rec.headline).toContain('on 1 January')
  })

  it('states what the agent really does in each outreach mode', () => {
    const off = recommend({ option: option(now), choices: ALL, query: '' })
    const live = recommend({
      option: option(now, { plan: { mode: 'live' }, reachable: { fuel: 0, installer: 3 } }),
      choices: ALL,
      query: '',
    })
    const test = recommend({
      option: option(now, { plan: { mode: 'allowlist' }, reachable: { fuel: 0, installer: 3 } }),
      choices: ALL,
      query: '',
    })
    if (off.kind !== 'quotes' || live.kind !== 'quotes' || test.kind !== 'quotes') throw new Error('expected quotes')
    expect(off.agentLive).toBe(false)
    expect(off.agentLabel).toBe('See what the agent would say')
    expect(off.agentNote).toContain('nothing is sent')
    expect(live.agentLabel).toBe('Let our agent get quotes')
    expect(live.agentNote).toContain('does not read replies')
    expect(test.agentLabel).toBe('Let our agent get quotes (test lines)')
    expect(test.agentNote).toContain('test lines only')
  })
})
