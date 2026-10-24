import { describe, expect, it } from 'vitest'
import { parseNextStepsQuery, switchHref, verdictFacts } from '../next-steps-query'

const BACK = '/verdict?fuel=propane&units=1100&price=3.85&town=Worcester&tier=whole&year=2026&inc=no&ut=national_grid&src=manual'

describe('switchHref', () => {
  it('carries the verdict query to /switch unchanged', () => {
    expect(switchHref(BACK)).toBe(
      '/switch?fuel=propane&units=1100&price=3.85&town=Worcester&tier=whole&year=2026&inc=no&ut=national_grid&src=manual',
    )
  })

  it('is null without a back path or a query', () => {
    expect(switchHref(null)).toBeNull()
    expect(switchHref('/verdict')).toBeNull()
  })

  it('never follows an off-site back param', () => {
    const q = parseNextStepsQuery({ get: (k) => (k === 'back' ? 'https://evil.example/verdict?a=1' : null) })
    expect(q.back).toBeNull()
  })
})

describe('verdictFacts', () => {
  it('reads fuel, utility, tier and price', () => {
    expect(verdictFacts(BACK)).toEqual({ fuel: 'propane', billUtility: 'national_grid', tier: 'whole', unitPrice: 3.85 })
  })

  it('drops values /switch would not accept', () => {
    expect(verdictFacts('/verdict?fuel=coal&ut=bogus&price=-1&tier=x')).toEqual({
      fuel: null,
      billUtility: null,
      tier: null,
      unitPrice: null,
    })
  })

  it('reads the old nationalgrid spelling as national_grid', () => {
    expect(verdictFacts('/verdict?ut=nationalgrid').billUtility).toBe('national_grid')
  })

  it('is all null without a back path', () => {
    expect(verdictFacts(null).fuel).toBeNull()
  })
})
