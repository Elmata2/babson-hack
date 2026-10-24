/**
 * @built F-64 the parser is tested against Nominatim's real envelope, including
 * the rows it returns just outside the state line and the rows with only a ZIP.
 *
 * The list is a trust boundary: a New Hampshire address that slips through would
 * silently set the wrong climate zone, so `readSuggestions` filters on
 * Massachusetts rather than assuming the bounding box did it.
 */

import { describe, expect, it } from 'vitest'

import {
  MA_VIEWBOX,
  matchTown,
  nominatimUrl,
  normalizePlaceName,
  readSuggestions,
} from '../nominatim'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    place_id: 1,
    lat: '42.2626',
    lon: '-71.8023',
    display_name: '106 Chandler Street, Worcester, Massachusetts, 01609, United States',
    address: {
      house_number: '106',
      road: 'Chandler Street',
      city: 'Worcester',
      state: 'Massachusetts',
      state_code: 'ma',
      postcode: '01609',
      country_code: 'us',
    },
    ...overrides,
  }
}

describe('Massachusetts filter', () => {
  it('keeps a Worcester address', () => {
    const rows = readSuggestions([row()])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.label).toBe('106 Chandler Street, Worcester, MA, 01609')
    expect(rows[0]?.town).toBe('Worcester')
  })

  it('drops a New Hampshire row that made it through the box', () => {
    const nh = row({
      address: {
        house_number: '106',
        road: 'Chandler Street',
        city: 'Nashua',
        state: 'New Hampshire',
        state_code: 'nh',
        postcode: '03060',
        country_code: 'us',
      },
    })
    expect(readSuggestions([nh])).toHaveLength(0)
  })

  it('drops a row with no state but a non-Massachusetts ZIP', () => {
    const noState = row({ address: { road: 'Chandler Street', postcode: '10001', country_code: 'us' } })
    expect(readSuggestions([noState])).toHaveLength(0)
  })

  it('accepts a row that only has a Massachusetts ZIP', () => {
    const zipOnly = row({ address: { road: 'Chandler Street', postcode: '01609', country_code: 'us' } })
    const rows = readSuggestions([zipOnly])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.label).toBe('Chandler Street, MA, 01609')
  })
})

describe('rows the dropdown can render', () => {
  it('names every Chandler Street across the state, not just one', () => {
    const rows = readSuggestions([
      row(),
      row({
        place_id: 2,
        lat: '42.3601',
        lon: '-71.0589',
        address: {
          house_number: '106',
          road: 'Chandler Street',
          city: 'Boston',
          state: 'Massachusetts',
          state_code: 'ma',
          postcode: '02116',
          country_code: 'us',
        },
      }),
    ])
    expect(rows.map((entry) => entry.town)).toEqual(['Worcester', 'Boston'])
  })

  it('dedupes the same house by normalised line1 + postcode even at different coordinates', () => {
    const a = row({ place_id: 10, lat: '42.2626', lon: '-71.8023' })
    const b = row({
      place_id: 11,
      lat: '42.2630',
      lon: '-71.8030',
      address: { house_number: '106', road: 'CHANDLER ST.', city: 'Worcester', state: 'Massachusetts', postcode: '01609', country_code: 'us' },
    })
    expect(readSuggestions([a, b])).toHaveLength(1)
  })

  it('removes duplicates that differ only by place_id', () => {
    const rows = readSuggestions([row({ place_id: 1 }), row({ place_id: 99 })])
    expect(rows).toHaveLength(1)
  })

  it('skips rows without usable coordinates', () => {
    expect(readSuggestions([row({ lat: null, lon: null })])).toHaveLength(0)
    expect(readSuggestions([row({ lat: 'not-a-number' })])).toHaveLength(0)
  })

  it('caps the list so the dropdown stays a shortcut, not a table', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      row({ place_id: index, address: { ...(row().address as object), house_number: String(index + 1) } }),
    )
    expect(readSuggestions(many)).toHaveLength(8)
  })

  it('returns an empty list for hostile payloads rather than throwing', () => {
    for (const value of [null, undefined, 'nope', 42, { results: [] }]) {
      expect(readSuggestions(value)).toEqual([])
    }
  })
})

describe('matching a locality to the 351-town table', () => {
  const towns = ['Wellesley', 'Worcester', 'Boston', 'Lakeville']

  it('normalises a town-of prefix and case', () => {
    expect(normalizePlaceName('Town of Wellesley')).toBe('wellesley')
    expect(matchTown('Town of Wellesley', towns)).toBe('Wellesley')
    expect(matchTown('WELLESLEY', towns)).toBe('Wellesley')
  })

  it('refuses a village that is not a municipality', () => {
    expect(matchTown('Newton Centre', towns)).toBeNull()
    expect(matchTown(null, towns)).toBeNull()
  })
})

describe('the upstream request', () => {
  it('bounds the search to Massachusetts and asks for address details', () => {
    const url = new URL(nominatimUrl('106 chandler street'))
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('bounded')).toBe('1')
    expect(url.searchParams.get('viewbox')).toBe(MA_VIEWBOX)
    expect(url.searchParams.get('countrycodes')).toBe('us')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('8')
  })

  it('encodes the query instead of interpolating it', () => {
    const url = nominatimUrl('106 chandler street & main')
    expect(url).toContain('q=106+chandler+street+%26+main')
  })
})
