/**
 * Unit test for the untested `massSaveGate` in lib/mass-save.ts.
 *
 * The function decides Mass Save eligibility from a sponsor key:
 * - Investor-owned sponsors (Eversource, National Grid, Unitil) → true
 * - Municipal light plant → false
 * - Unknown / other → null
 */

import { describe, expect, it } from 'vitest'

import { massSaveGate } from '../mass-save'

describe('massSaveGate', () => {
  it('returns true for Eversource', () => {
    expect(massSaveGate('eversource')).toBe(true)
  })

  it('returns true for National Grid', () => {
    expect(massSaveGate('nationalgrid')).toBe(true)
  })

  it('returns true for Unitil', () => {
    expect(massSaveGate('unitil')).toBe(true)
  })

  it('returns false for a municipal light plant', () => {
    expect(massSaveGate('municipal')).toBe(false)
  })

  it('returns null for Cape Light Compact (it is a sponsor but the gate does not pre-judge)', () => {
    expect(massSaveGate('cape_light')).toBeNull()
  })

  it('returns null for "other"', () => {
    expect(massSaveGate('other')).toBeNull()
  })

  it('returns null for a null sponsor (town not found or mixed)', () => {
    expect(massSaveGate(null)).toBeNull()
  })
})
