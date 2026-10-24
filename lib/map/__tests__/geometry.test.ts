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
