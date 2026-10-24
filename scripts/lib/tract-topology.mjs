/**
 * @built F-61 tract geometry → TopoJSON artefact, one implementation
 *
 * Shared by `bake-map.mjs` (which writes the artefact after fetching) and
 * `trim-geo.mjs` (which re-simplifies from cache and reports sizes). Keeping one
 * code path is the point: the size budget is an acceptance criterion, and the
 * file that trim reports on must be the file the map loads.
 */

import { buildTopology, decodeRings, openRing, partsOfGeometry, quantise, ringBounds, ringsOfGeometry } from './geo.mjs'

/** 1e-5 degrees ≈ 1.1 m: finer than any zoom this map reaches. */
export const DEFAULT_SCALE = 1e-5
/** 0.0005 degrees ≈ 50 m, applied to shared arcs after cutting. */
export const DEFAULT_TOLERANCE_DEG = 0.0005

/**
 * Build the tract topology and validate it by decoding every ring back.
 * @param {Array<{properties: Record<string, any>, geometry: any}>} features GeoJSON tracts
 * @param {{source: string, url: string, fetchedAt: string|null, scale?: number, toleranceDeg?: number}} opts
 */
export function buildTractTopology(features, opts) {
  const scaleValue = opts.scale ?? DEFAULT_SCALE
  const toleranceDeg = opts.toleranceDeg ?? DEFAULT_TOLERANCE_DEG

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const feature of features) {
    const [a, b, c, d] = ringBounds(ringsOfGeometry(feature.geometry))
    if (a < minX) minX = a
    if (b < minY) minY = b
    if (c > maxX) maxX = c
    if (d > maxY) maxY = d
  }

  const translate = [minX, minY]
  const scale = [scaleValue, scaleValue]
  const shapes = features.map((feature) => {
    const parts = partsOfGeometry(feature.geometry)
    const quantised = parts.map((part) =>
      part.map((ring) =>
        openRing(ring.map(([x, y]) => [quantise(x, translate[0], scale[0]), quantise(y, translate[1], scale[1])])),
      ),
    )
    const geoid = String(feature.properties?.GEOID ?? '')
    return { id: geoid, parts: quantised, properties: { geoid } }
  })

  const { topology, stats } = buildTopology(shapes, {
    bbox: [minX, minY, maxX, maxY],
    translate,
    scale,
    tolerance: Math.round(toleranceDeg / scaleValue),
    objectName: 'tracts',
  })

  // ---- round-trip: a topology that cannot be decoded back is not shipped -----
  const decoded = decodeRings(topology, 'tracts')
  const sourceRingCount = shapes.reduce((n, s) => n + s.parts.reduce((m, p) => m + p.length, 0), 0)
  if (decoded.length !== sourceRingCount) {
    throw new Error(`topology round-trip: ${decoded.length} rings decoded, ${sourceRingCount} expected`)
  }
  let unclosed = 0
  let degenerate = 0
  for (const ring of decoded) {
    if (ring.length < 4) degenerate += 1
    else if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) unclosed += 1
  }
  if (unclosed > 0 || degenerate > 0) {
    throw new Error(`topology round-trip failed: ${unclosed} unclosed rings, ${degenerate} degenerate rings`)
  }
  if (stats.shapes !== features.length) {
    throw new Error(`topology lost shapes: ${stats.shapes} of ${features.length}`)
  }

  const artefact = {
    _meta: {
      source: opts.source,
      url: opts.url,
      fetchedAt: opts.fetchedAt,
      recordCount: stats.shapes,
      format: 'TopoJSON, quantised + shared arcs; properties: { geoid }',
      quantisation: { scale, translate },
      simplification: {
        method: 'Ramer–Douglas–Peucker on shared arcs, after cutting at junction vertices',
        toleranceDegrees: toleranceDeg,
        note: 'Arcs are cut and simplified before dedupe, so neighbouring tracts share byte-identical borders and no gaps open between them.',
      },
      vertices: {
        source: stats.sourceVertices,
        kept: stats.vertices,
        retainedShare: Number((stats.vertices / stats.sourceVertices).toFixed(3)),
      },
      arcs: stats.arcs,
      junctions: stats.junctions,
      roundTrip: 'decoded and verified: every shape present, every ring closed',
      caveat: 'Tract borders are cartographic, not legal boundaries. Display only.',
    },
    ...topology,
  }

  return { artefact, stats }
}
