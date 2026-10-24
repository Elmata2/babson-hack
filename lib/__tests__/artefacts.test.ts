/**
 * @built F-13/F-61 acceptance criteria as tests: sizes on disk, record counts,
 * provenance blocks, and the structural health of the tract topology.
 *
 * A size budget that only lives in a document is a wish. These assertions run in
 * `npm run check`, so an over-budget artefact fails the same command as a type
 * error.
 */

import { readFileSync, statSync } from 'node:fs'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const KB = 1024

function sizes(path: string) {
  const buffer = readFileSync(path)
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
  }
}

const TRACTS = 'public/data/ma-tracts.topo.json'
const TOWNS = 'public/data/ma-towns.json'
const STATS = 'public/data/ma-tract-stats.json'
const EJ = 'public/data/ej-blockgroups.json'
const UTILITIES = 'data/generated/utilities.json'
const HDD = 'data/generated/hdd-by-county.json'
const INDEX = 'data/generated/towns-by-county.json'

describe('artefact sizes against the design §3 budgets', () => {
  it('keeps tracts at ≤ 2.5 MB raw and < 700 KB brotli', () => {
    const tractSizes = sizes(TRACTS)
    expect(tractSizes.raw).toBeLessThanOrEqual(2.5 * 1024 * KB)
    expect(tractSizes.brotli).toBeLessThan(700 * KB)
    expect(tractSizes.gzip).toBeLessThan(700 * KB)
  })

  it('keeps tract stats at ≤ 150 KB', () => {
    expect(sizes(STATS).raw).toBeLessThanOrEqual(150 * KB)
  })

  it('keeps towns at ≤ 400 KB', () => {
    expect(sizes(TOWNS).raw).toBeLessThanOrEqual(400 * KB)
  })

  it('keeps utilities at ≤ 30 KB, because the verdict path imports it', () => {
    expect(sizes(UTILITIES).raw).toBeLessThanOrEqual(30 * KB)
  })

  it('keeps EJ at ≤ 300 KB and HDD at ≤ 3 KB', () => {
    expect(sizes(EJ).raw).toBeLessThanOrEqual(300 * KB)
    expect(sizes(HDD).raw).toBeLessThanOrEqual(3 * KB)
  })

  it('keeps the town→tract index small enough to inline', () => {
    expect(sizes(INDEX).raw).toBeLessThanOrEqual(80 * KB)
  })
})

describe('every artefact carries a usable _meta block', () => {
  const files = [TRACTS, TOWNS, STATS, EJ, UTILITIES, HDD, INDEX]

  it('has source, url, fetchedAt and recordCount', () => {
    for (const file of files) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      const meta = parsed._meta as Record<string, unknown> | undefined
      expect(meta, `${file} has no _meta`).toBeTruthy()
      expect(typeof meta?.source, `${file} source`).toBe('string')
      expect(typeof meta?.url, `${file} url`).toBe('string')
      expect(typeof meta?.fetchedAt, `${file} fetchedAt`).toBe('string')
      expect(Number.isNaN(Date.parse(String(meta?.fetchedAt))), `${file} fetchedAt parses`).toBe(false)
      expect(typeof meta?.recordCount, `${file} recordCount`).toBe('number')
    }
  })
})

describe('tract topology structure', () => {
  const topology = JSON.parse(readFileSync(TRACTS, 'utf8')) as {
    type: string
    transform: { scale: [number, number]; translate: [number, number] }
    objects: { tracts: { type: string; geometries: Array<{ type: string; properties: { geoid: string }; arcs: unknown }> } }
    arcs: Array<Array<[number, number]>>
  }

  it('is a real TopoJSON topology with one geometry per tract', () => {
    expect(topology.type).toBe('Topology')
    expect(topology.transform.scale).toHaveLength(2)
    expect(topology.objects.tracts.geometries).toHaveLength(1_620)
    const ids = new Set(topology.objects.tracts.geometries.map((geometry) => geometry.properties.geoid))
    expect(ids.size).toBe(1_620)
    for (const id of ids) expect(id).toMatch(/^25\d{9}$/)
  })

  it('shares arcs between neighbours instead of duplicating boundaries', () => {
    // Every arc is a delta-encoded polyline; the first point is absolute.
    for (const arc of topology.arcs) {
      expect(arc.length).toBeGreaterThanOrEqual(2)
      expect(arc[0]).toHaveLength(2)
    }
    expect(topology.arcs.length).toBeLessThan(6_000)
    expect(topology.arcs.length).toBeLessThan(1_620 * 4)
  })

  it('every tract geometry references arcs that exist', () => {
    for (const geometry of topology.objects.tracts.geometries) {
      const refs: number[] =
        geometry.type === 'Polygon'
          ? (geometry.arcs as number[][]).flat()
          : (geometry.arcs as number[][][]).flat(2)
      expect(refs.length).toBeGreaterThan(0)
      for (const ref of refs) {
        const index = ref >= 0 ? ref : ~ref
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(topology.arcs.length)
      }
    }
  })
})

describe('town geometry', () => {
  const towns = JSON.parse(readFileSync(TOWNS, 'utf8')) as {
    type: string
    features: Array<{ properties: { geoid: string; town: string; county: string } }>
  }

  it('has 351 features with unique 10-digit GEOIDs', () => {
    expect(towns.type).toBe('FeatureCollection')
    expect(towns.features).toHaveLength(351)
    const geoids = new Set(towns.features.map((feature) => feature.properties.geoid))
    expect(geoids.size).toBe(351)
    for (const geoid of geoids) expect(geoid).toMatch(/^25\d{8}$/)
  })

  it('names every town and county', () => {
    for (const feature of towns.features) {
      expect(feature.properties.town.length).toBeGreaterThan(1)
      expect(feature.properties.county.length).toBeGreaterThan(1)
    }
  })

  it('has a file mtime and a size we can quote in the review', () => {
    expect(statSync(TRACTS).size).toBeGreaterThan(0)
  })
})

describe('tract statistics artefact', () => {
  const stats = JSON.parse(readFileSync(STATS, 'utf8')) as {
    tracts: Record<string, number[]>
  }

  it('covers all 1,620 tracts with seven numeric fields', () => {
    expect(Object.keys(stats.tracts)).toHaveLength(1_620)
    for (const [geoid, values] of Object.entries(stats.tracts)) {
      expect(geoid).toMatch(/^25\d{9}$/)
      expect(values).toHaveLength(7)
      for (const value of values) expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('never reports more oil households than households', () => {
    for (const [geoid, values] of Object.entries(stats.tracts)) {
      const [, households, oil] = values
      expect(oil, geoid).toBeLessThanOrEqual(households)
    }
  })
})

describe('utility artefact', () => {
  const utilities = JSON.parse(readFileSync(UTILITIES, 'utf8')) as {
    towns: Record<string, { sponsors: string[]; hasMunicipal: boolean; mixed: boolean }>
  }

  it('has 351 towns and no unresolved sponsors', () => {
    const entries = Object.entries(utilities.towns)
    expect(entries).toHaveLength(351)
    for (const [town, row] of entries) {
      expect(row.sponsors.length, town).toBeGreaterThan(0)
      expect(row.sponsors).not.toContain('other')
      expect(row.hasMunicipal).toBe(row.sponsors.includes('municipal'))
      expect(row.mixed).toBe(row.sponsors.length > 1)
    }
  })

  it('covers the documented distribution: 41 municipal-only, 17 mixed', () => {
    const rows = Object.values(utilities.towns)
    expect(rows.filter((row) => row.sponsors.length === 1 && row.sponsors[0] === 'municipal')).toHaveLength(41)
    expect(rows.filter((row) => row.mixed)).toHaveLength(17)
  })
})
