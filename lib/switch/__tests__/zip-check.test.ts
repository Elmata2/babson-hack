/** @built F-151 the ZIP check on the consent screen */

import { describe, expect, it } from 'vitest'

import { checkZip } from '../zip-check'

describe('checkZip', () => {
  it('accepts a Massachusetts ZIP in the current town', () => {
    const result = checkZip('01701', 'Framingham')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.zip).toBe('01701')
      expect(result.town).toBe('Framingham')
      expect(result.differs).toBe(false)
    }
  })

  it('resolves a ZIP in another town and flags the change', () => {
    const result = checkZip('02474', 'Framingham')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.town).toBe('Arlington')
      expect(result.differs).toBe(true)
    }
  })

  it('refuses a malformed or non-Massachusetts ZIP with a sentence', () => {
    const short = checkZip('0247', 'Framingham')
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.error).toContain('five digits')

    const foreign = checkZip('10001', 'Framingham')
    expect(foreign.ok).toBe(false)
    if (!foreign.ok) expect(foreign.error).toContain('not in the Massachusetts table')
  })
})
