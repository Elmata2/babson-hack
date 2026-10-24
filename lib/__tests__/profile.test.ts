/** @built F-74 tests for profile validation and the "persist or clear" decision */

import { describe, expect, it } from 'vitest'
import { isEmptyProfile, sanitizeProfile } from '../../components/map/use-profile'
import { EMPTY_PROFILE } from '../../components/map/types'

describe('profile storage', () => {
  it('treats an untouched profile as empty, so clear leaves no stored entry', () => {
    expect(isEmptyProfile({ ...EMPTY_PROFILE })).toBe(true)
    expect(isEmptyProfile({ ...EMPTY_PROFILE, town: 'Wellesley' })).toBe(false)
  })
  it('drops corrupt fields and keeps valid ones', () => {
    const p = sanitizeProfile({ town: 5, kwh: 'x', fuel: 'oil', supply: 'bogus' })
    expect(p.town).toBe('')
    expect(p.kwh).toBe(600)
    expect(p.fuel).toBe('oil')
    expect(p.supply).toBeNull()
  })
})
