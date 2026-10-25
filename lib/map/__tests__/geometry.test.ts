import { describe, expect, it } from 'vitest'
import { anchorOf, geometryHas, type AreaGeometry } from '../geometry'

describe('anchorOf', () => {
  it('stays inside a crescent whose bounding-box centre is outside it', () => {
    const crescent: AreaGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 8],
          [8, 8],
          [8, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    }
    expect(geometryHas(crescent, 5, 5)).toBe(false)
    const [x, y] = anchorOf(crescent)
    expect(geometryHas(crescent, x, y)).toBe(true)
  })
})

import { bboxOf, inPolygon, polygonsOf } from '../geometry'

// ---------------------------------------------------------------------------
// polygonsOf — unwraps Polygon and MultiPolygon into a flat list of ring arrays
// ---------------------------------------------------------------------------

describe('polygonsOf', () => {
  const polygon: AreaGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }

  it('wraps a single Polygon in a one-element array', () => {
    expect(polygonsOf(polygon)).toHaveLength(1)
  })

  const multi: AreaGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [5, 0],
          [5, 5],
          [0, 5],
          [0, 0],
        ],
      ],
      [
        [
          [10, 10],
          [15, 10],
          [15, 15],
          [10, 15],
          [10, 10],
        ],
      ],
    ],
  }

  it('flattens a MultiPolygon into its parts', () => {
    expect(polygonsOf(multi)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// inPolygon — point-in-polygon with holes
// ---------------------------------------------------------------------------

describe('inPolygon', () => {
  const square: [number, number][][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ]

  it('returns true for a point inside the outer ring', () => {
    expect(inPolygon(5, 5, square)).toBe(true)
  })

  it('returns false for a point outside the outer ring', () => {
    expect(inPolygon(15, 15, square)).toBe(false)
  })

  it('returns false for a point inside the outer ring but inside a hole', () => {
    const withHole: [number, number][][] = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      // hole
      [
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
        [3, 3],
      ],
    ]
    expect(inPolygon(5, 5, withHole)).toBe(false)
    expect(inPolygon(1, 1, withHole)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// bboxOf — bounding box [w, s, e, n]
// ---------------------------------------------------------------------------

describe('bboxOf', () => {
  it('computes the bounding box of a single polygon', () => {
    const geo: AreaGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-71, 42],
          [-70, 42],
          [-70, 43],
          [-71, 43],
          [-71, 42],
        ],
      ],
    }
    expect(bboxOf(geo)).toEqual([-71, 42, -70, 43])
  })

  it('computes the bounding box of a MultiPolygon across both parts', () => {
    const geo: AreaGeometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 10],
            [12, 10],
            [12, 12],
            [10, 12],
            [10, 10],
          ],
        ],
      ],
    }
    expect(bboxOf(geo)).toEqual([0, 0, 12, 12])
  })
})

// ---------------------------------------------------------------------------
// Edge cases: empty or degenerate geometry
// ---------------------------------------------------------------------------

describe('edge cases on empty geometry', () => {
  it('inPolygon throws on an empty polygon (no rings)', () => {
    // This is a known edge case: inPolygon calls inRing(x, y, rings[0])
    // where rings[0] is undefined for an empty polygon array.
    expect(() => inPolygon(0, 0, [])).toThrow(TypeError)
  })

  it('bboxOf throws on empty geometry (no rings — known edge case)', () => {
    const empty: AreaGeometry = {
      type: 'Polygon',
      coordinates: [],
    }
    // polygonsOf returns [[]] (one polygon with no rings), so polygon[0] is
    // undefined and all.map((c) => c[0]) throws. The caller must guard against
    // empty geometry — this is a known edge case, not handled internally.
    expect(() => bboxOf(empty)).toThrow(TypeError)
  })
})
