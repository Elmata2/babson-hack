/**
 * @built F-14 the badge may only claim what the adapter reported
 *
 * The point of these tests is the failure the badge exists to prevent: a screen
 * saying "live" over a stale snapshot, or a date rendered as an unreadable ISO
 * string on a projector.
 */

import { describe, expect, it } from 'vitest'

import { formatDateShort, priceFreshness } from '../freshness'

describe('price freshness', () => {
  it('reports live only when the adapter says live', () => {
    expect(priceFreshness({ mode: 'live', asOf: '2026-10-19' })).toEqual({
      kind: 'live',
      date: '2026-10-19',
    })
  })

  it('downgrades a partial reading to snapshot', () => {
    expect(priceFreshness({ mode: 'partial', asOf: '2026-10-19' }).kind).toBe('snapshot')
    expect(priceFreshness({ mode: 'snapshot', asOf: '2026-10-19' }).kind).toBe('snapshot')
  })

  it('carries the date it describes', () => {
    expect(priceFreshness({ mode: 'snapshot', asOf: '2026-10-19' }).date).toBe('2026-10-19')
  })
})

describe('short dates', () => {
  it('renders a week date as day + month', () => {
    expect(formatDateShort('2026-10-19')).toBe('19 Oct')
  })

  it('renders a month period as month + year, because that is all it describes', () => {
    expect(formatDateShort('2026-08')).toBe('Aug 2026')
  })

  it('returns null for null and passes unparseable values through', () => {
    expect(formatDateShort(null)).toBeNull()
    expect(formatDateShort('last week')).toBe('last week')
  })

  it('does not shift the day across a timezone', () => {
    expect(formatDateShort('2026-01-01')).toBe('1 Jan')
    expect(formatDateShort('2026-12-31')).toBe('31 Dec')
  })
})
