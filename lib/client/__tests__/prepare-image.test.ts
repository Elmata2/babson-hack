/**
 * @built F-107 the size math and decisions behind client image prep (no canvas)
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_PDF_BYTES,
  checkTotalSize,
  fitWithin,
  isHeic,
  nextQuality,
  planPrepare,
} from '../prepare-image'

const MB = 1024 * 1024

describe('planPrepare', () => {
  it('re-encodes images, including HEIC by extension when the type is blank', () => {
    expect(planPrepare({ name: 'a.jpg', type: 'image/jpeg', size: 5 * MB }).action).toBe('reencode')
    expect(planPrepare({ name: 'IMG_1.HEIC', type: '', size: 3 * MB }).action).toBe('reencode')
  })
  it('renders PDFs locally and rejects a PDF too large to decode', () => {
    expect(planPrepare({ name: 'b.pdf', type: 'application/pdf', size: 2 * MB }).action).toBe('render_pdf')
    expect(planPrepare({ name: 'b.pdf', type: '', size: 2 * MB }).action).toBe('render_pdf')
    expect(planPrepare({ name: 'b.pdf', type: 'application/pdf', size: MAX_PDF_BYTES + 1 }).action).toBe('reject')
  })
  it('leaves unknown types for the route to refuse', () => {
    expect(planPrepare({ name: 'x.docx', type: 'application/zip', size: 10 }).action).toBe('passthrough')
  })
  it('detects heic', () => {
    expect(isHeic({ name: 'x', type: 'image/heif' })).toBe(true)
    expect(isHeic({ name: 'x.png', type: 'image/png' })).toBe(false)
  })
})

describe('fitWithin', () => {
  it('scales the long edge to 2000 and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 })
  })
  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('nextQuality', () => {
  it('steps from 0.85 down to the 0.6 floor then stops at the floor', () => {
    const seen: number[] = []
    let q: number | null = 0.85
    while (q !== null) {
      seen.push(q)
      q = nextQuality(q)
    }
    expect(seen).toEqual([0.85, 0.75, 0.68, 0.6])
  })
})

describe('checkTotalSize', () => {
  it('accepts up to 3 files under 4 MB', () => {
    expect(checkTotalSize([MB, MB, MB])).toBeNull()
  })
  it('refuses a fourth file and an oversize total', () => {
    expect(checkTotalSize([1, 1, 1, 1])).toMatch(/at most 3/)
    expect(checkTotalSize([3 * MB, 2 * MB])).toMatch(/4 MB/)
  })
})
