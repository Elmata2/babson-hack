import { describe, expect, it } from 'vitest'

import { INSTALL_DEADLINE, kitPlan, type KitPlanInput } from '../kit-steps'
import type { SharedFacts } from '../types'

const FACTS: SharedFacts = {
  town: 'Arlington',
  zip: '02474',
  fuel: 'gas',
  annualVolume: 700,
  unit: 'therms',
  deliverySizeGal: 150,
  tankSizeGal: null,
  deliveryWindow: null,
  sqft: 1800,
  tons: 3.5,
}

function input(overrides: Partial<KitPlanInput> = {}): KitPlanInput {
  return {
    kind: 'installer',
    town: 'Arlington',
    facts: FACTS,
    mode: 'off',
    providers: [],
    ...overrides,
  }
}

const allText = (plan: ReturnType<typeof kitPlan>) =>
  [plan.heading, plan.lede, plan.closing, ...plan.steps.flatMap((step) => [step.title, step.copy])].join('\n')

describe('kitPlan — the installer path', () => {
  it('prints the agent plan when a call can actually be placed', () => {
    const plan = kitPlan(input({ mode: 'live', providers: [{ name: 'Team test line — installer A', phone: '+15550100011', allowlist: true }] }))
    expect(plan.path).toBe('agent')
    expect(plan.steps.length).toBeGreaterThanOrEqual(4)
    const text = allText(plan)
    expect(text).toContain('Mass Save Heat Pump Installer Network')
    expect(text).toContain('0% HEAT Loan')
    expect(text).toContain(INSTALL_DEADLINE)
    expect(text).toContain('per ton')
    expect(text).toContain('3.5 tons')
    expect(text.toLowerCase()).toContain('never signs')
  })

  it('treats the allowlist plan as the agent plan, because those lines are dialable', () => {
    const plan = kitPlan(input({ mode: 'allowlist', providers: [{ name: 'Team test line — installer A', phone: '+15550100011', allowlist: true }] }))
    expect(plan.path).toBe('agent')
  })

  it('says the demo run is replayed rather than pretending a call happens', () => {
    const plan = kitPlan(input({ mode: 'demo', providers: [{ name: 'Team test line — installer A', phone: '+15550100011', allowlist: true }] }))
    expect(plan.path).toBe('agent')
    expect(plan.lede.toLowerCase()).toContain('replayed')
  })

  it('prints the manual plan when no agent can dial, with the four questions in order', () => {
    const plan = kitPlan(input({ mode: 'off' }))
    expect(plan.path).toBe('self')
    const text = allText(plan)
    expect(text).toContain('masssave.com')
    expect(text.indexOf('Mass Save Heat Pump Installer Network')).toBeLessThan(text.indexOf('0% HEAT Loan'))
    expect(text.indexOf('0% HEAT Loan')).toBeLessThan(text.indexOf(INSTALL_DEADLINE))
    expect(text.indexOf(INSTALL_DEADLINE)).toBeLessThan(text.indexOf('ballpark cost per ton'))
    expect(text).toContain('Home Energy Assessment')
  })

  it('prints a contractor number only when the row carries one, and labels a test line', () => {
    const withPhone = kitPlan(
      input({ mode: 'off', providers: [{ name: 'Sourced Co', phone: '+16175551234', allowlist: false }] }),
    )
    expect(allText(withPhone)).toContain('+16175551234')

    const withoutPhone = kitPlan(input({ mode: 'off', providers: [{ name: 'Sourced Co', phone: null, allowlist: false }] }))
    expect(allText(withoutPhone)).not.toContain('+1')
    expect(allText(withoutPhone)).toContain('No contractor number is printed here')

    const testLine = kitPlan(input({ mode: 'off', providers: [{ name: 'Team line', phone: '+15550100011', allowlist: true }] }))
    expect(allText(testLine)).toContain('team test line')
  })

  it('admits that the size is not known yet rather than inventing one', () => {
    const plan = kitPlan(input({ mode: 'off', facts: { ...FACTS, tons: null, sqft: null } }))
    expect(plan.path).toBe('self')
    expect(allText(plan)).toContain('Once the assessment sizes the house')
    expect(allText(plan)).not.toContain('tons)')
  })
})

describe('kitPlan — fuel and supply', () => {
  it('gives the fuel order in the order a household should do it', () => {
    const plan = kitPlan(
      input({
        kind: 'fuel',
        mode: 'off',
        providers: [{ name: 'Dealer A', phone: '+16175551234', allowlist: false }],
      }),
    )
    expect(plan.path).toBe('self')
    const text = allText(plan)
    expect(text).toContain('Arlington')
    expect(text).toContain('700 therms a year')
    expect(text).toContain('cash/COD')
    expect(text).toContain('Dealer A')
    expect(plan.steps[0].title.toLowerCase()).toContain('dealer who delivers now')
  })

  it('never claims an agent is calling when the plan is off, for fuel either', () => {
    const plan = kitPlan(input({ kind: 'fuel', mode: 'off', providers: [] }))
    expect(plan.path).toBe('self')
    expect(allText(plan)).not.toContain('The agent places the calls')
  })

  it('keeps supply a published checklist with no call', () => {
    const plan = kitPlan(input({ kind: 'supply', mode: 'live', providers: [] }))
    expect(plan.path).toBe('self')
    expect(allText(plan)).toContain('nothing is called')
    expect(allText(plan)).toContain('early termination fee')
  })
})
