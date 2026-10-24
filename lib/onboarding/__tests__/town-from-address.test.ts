import { describe, expect, it } from 'vitest'

import { TOWNS } from '../../geo'
import { townAddressReason, townFromAddress } from '../town-from-address'

describe('townFromAddress', () => {
  it('has the 351 towns', () => {
    expect(TOWNS.length).toBe(351)
  })

  it('reads the town from the typed address in the reported bug', () => {
    expect(townFromAddress('12 Main St, Worcester, MA 01608', TOWNS)).toEqual({ kind: 'matched', town: 'Worcester', via: 'name' })
  })

  it('is case-insensitive', () => {
    expect(townFromAddress('12 main st, WORCESTER', TOWNS)).toMatchObject({ town: 'Worcester' })
  })

  it('falls back to the ZIP when no town is named', () => {
    expect(townFromAddress('12 Main St, MA 01608', TOWNS)).toEqual({ kind: 'matched', town: 'Worcester', via: 'zip' })
  })

  it('finds a single town in an unpunctuated address', () => {
    expect(townFromAddress('12 Main St Worcester', TOWNS)).toMatchObject({ town: 'Worcester' })
  })

  it('prefers the longer name', () => {
    expect(townFromAddress('4 Elm St, North Adams, MA', TOWNS)).toMatchObject({ town: 'North Adams' })
  })

  it('flags two towns with no comma or ZIP as ambiguous', () => {
    const result = townFromAddress('12 Boston Post Rd Worcester', TOWNS)
    expect(result.kind).toBe('ambiguous')
    expect(townAddressReason(result)).toContain('Boston')
  })

  it('lets the ZIP settle a street named for another town', () => {
    expect(townFromAddress('12 Boston Rd 01608', TOWNS)).toMatchObject({ town: 'Worcester', via: 'zip' })
  })

  it('matches nothing for gibberish or short text', () => {
    expect(townFromAddress('zzzz', TOWNS).kind).toBe('none')
    expect(townFromAddress('12', TOWNS).kind).toBe('none')
    expect(townAddressReason({ kind: 'none' })).toContain('Pick your town')
  })

  it('refuses addresses in other states and out-of-state ZIPs', () => {
    for (const text of [
      '1 Main St, Salem, NH',
      'Dover, NH 03820',
      'Springfield, IL',
      '5 Elm St, Springfield IL 62701',
      '9 Oak Ave, Lowell, New York',
      '3 Pine St, Salem NH',
      '12 Main St, Worcester, 03820',
    ]) {
      expect(townFromAddress(text, TOWNS).kind, text).toBe('none')
    }
  })

  it('still matches MA addresses that look similar', () => {
    expect(townFromAddress('1 Main St, Salem, MA 01970', TOWNS)).toMatchObject({ town: 'Salem' })
    expect(townFromAddress('1 Main St, Dover, MA', TOWNS)).toMatchObject({ town: 'Dover' })
    expect(townFromAddress('4 Elm St, Florida, MA', TOWNS)).toMatchObject({ town: 'Florida' })
    expect(townFromAddress('4 Elm St, Washington, MA 01223', TOWNS)).toMatchObject({ town: 'Washington' })
    expect(townFromAddress('1 Main St, Pittsfield, MA 05501', TOWNS).kind).toBe('matched')
  })
})
