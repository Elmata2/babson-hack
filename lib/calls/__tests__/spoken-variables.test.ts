import { describe, expect, it } from 'vitest'

import { spokenVariables } from '../route-model'

describe('spokenVariables', () => {
  it('asks an installer about heat pump prices and keeps the household fuel separately', () => {
    expect(spokenVariables({ town: 'Arlington', fuel: 'oil', tons: '3.5' }, 'installer')).toEqual({
      town: 'Arlington',
      tons: '3.5',
      current_fuel: 'oil',
      fuel: 'heat pump',
    })
  })

  it('always fills the disclosure hole, for both verticals', () => {
    expect(spokenVariables({ town: 'Natick' }, 'installer').fuel).toBe('heat pump')
    expect(spokenVariables({ town: 'Natick' }, 'fuel').fuel).toBe('heating fuel')
    expect(spokenVariables({ town: 'Natick', fuel: 'propane' }, 'fuel').fuel).toBe('propane')
  })
})
