/**
 * @built F-61 ring simplification, quantisation and TopoJSON assembly
 *
 * Why a hand-rolled TopoJSON writer: the committed tract layer must fit 2.5 MB
 * raw / 700 KB brotli for all 1,620 tracts, and sharing boundaries between
 * neighbours is where most of that win comes from. Simplifying each ring on its
 * own would also open hairline gaps along every shared boundary, so the order is
 * deliberate: quantise → cut into arcs at shared vertices → simplify the *arcs*
 * → dedupe. Neighbours therefore reference byte-identical arcs.
 *
 * Everything here is pure: arrays in, arrays out. `trim-geo.mjs` calls it.
 */

// ------------------------------------------------------------------ polylines

/** @typedef {[number, number]} Point */
/** @typedef {Point[]} Ring */

/**
 * Ramer–Douglas–Peucker on an open polyline. Endpoints are always kept, which is
 * what preserves arc sharing: a junction vertex can never be simplified away.
 * @param {Point[]} points
 * @param {number} tolerance in quantised grid units
 * @returns {Point[]}
 */
export function simplifyLine(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  /** @type {Array<[number, number]>} */
  const stack = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()
    if (last - first < 2) continue
    const [x1, y1] = points[first]
    const [x2, y2] = points[last]
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSq = dx * dx + dy * dy
    let farthest = -1
    let farthestDistSq = -1
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i]
      let distSq
      if (lengthSq === 0) {
        distSq = (px - x1) ** 2 + (py - y1) ** 2
      } else {
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq
        if (t < 0) t = 0
        else if (t > 1) t = 1
        distSq = (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2
      }
      if (distSq > farthestDistSq) {
        farthestDistSq = distSq
        farthest = i
      }
    }
    if (farthest !== -1 && farthestDistSq > tolerance * tolerance) {
      keep[farthest] = 1
      stack.push([first, farthest], [farthest, last])
    }
  }

  const out = []
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i])
  return out
}

/** Drop the repeated closing vertex of a ring, if present. */
export function openRing(ring) {
  if (ring.length < 2) return ring.slice()
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  return fx === lx && fy === ly ? ring.slice(0, -1) : ring.slice()
}

/** Close an open ring (first vertex repeated at the end). */
export function closeRing(ring) {
  if (ring.length === 0) return ring.slice()
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  return fx === lx && fy === ly ? ring.slice() : [...ring, [fx, fy]]
}

/** Quantise a lon/lat into an integer grid coordinate. */
export const quantise = (value, origin, step) => Math.round((value - origin) / step)

// ------------------------------------------------------------------- topology

/**
 * Build a TopoJSON topology with shared, delta-encoded arcs.
 *
 * @param {Array<{id: string, parts: Ring[][], properties: Record<string, unknown>}>} shapes
 *   Quantised integer rings. `parts` is one entry per polygon: [outer, ...holes].
 *   A shape with more than one part becomes a MultiPolygon.
 * @param {{bbox: number[], translate: [number, number], scale: [number, number], tolerance: number, objectName: string}} opts
 */
export function buildTopology(shapes, opts) {
  const { translate, scale, tolerance, objectName, bbox } = opts

  // ---- 1. count vertices so shared boundaries become arc junctions --------
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const shape of shapes) {
    for (const part of shape.parts) {
      for (const ring of part) {
        for (const [x, y] of openRing(ring)) {
          const key = `${x},${y}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  /**
   * A junction is a vertex shared by three or more rings — a place where a
   * boundary actually ends. Counting two-ring vertices would cut every shared
   * boundary into single-edge arcs, which defeats both sharing and simplification
   * (measured: 8.5 MB instead of 700 KB).
   */
  const junctions = new Set()
  for (const [key, count] of counts) if (count >= 3) junctions.add(key)

  // ---- 2. cut rings at junctions, simplify the arcs, dedupe --------------
  /** @type {Point[][]} */
  const arcs = []
  /** @type {Map<string, {index: number, storedReversed: boolean}>} */
  const arcIndex = new Map()

  /** @param {Point[]} points @returns {number} arc reference (negative = reverse the stored arc) */
  let internCalls = 0
  let internHits = 0
  const intern = (points) => {
    internCalls += 1
    const forwardKey = points.map((p) => `${p[0]},${p[1]}`).join(' ')
    const reversedKey = points
      .slice()
      .reverse()
      .map((p) => `${p[0]},${p[1]}`)
      .join(' ')
    // Arcs are always stored in canonical (lexicographically smaller) orientation,
    // so two neighbours walking the same boundary in opposite directions hit the
    // same entry and one of them gets `~index`.
    const useForward = forwardKey <= reversedKey
    const key = useForward ? forwardKey : reversedKey
    const existing = arcIndex.get(key)
    if (existing) {
      internHits += 1
      return useForward ? existing : ~existing
    }
    const index = arcs.length
    arcs.push(useForward ? points.slice() : points.slice().reverse())
    arcIndex.set(key, index)
    return useForward ? index : ~index
  }

  /** Cut one open ring into arcs at junction vertices. @returns {number[]} */
  const cutRing = (open) => {
    const n = open.length
    const closedArc = () => [intern(simplifyLine([...open, open[0]], tolerance))]

    // A "pinch" ring revisits a coordinate (coastal and water tracts do this).
    // Cutting such a ring at a repeated vertex produces a segment that closes on
    // itself, so keep it whole: correctness of the outline beats a few saved bytes.
    const seen = new Set()
    for (const [x, y] of open) {
      const key = `${x},${y}`
      if (seen.has(key)) return closedArc()
      seen.add(key)
    }

    /** @type {number[]} */
    const cutAt = []
    for (let i = 0; i < n; i += 1) {
      if (junctions.has(`${open[i][0]},${open[i][1]}`)) cutAt.push(i)
    }
    if (cutAt.length === 0) return closedArc()
    if (cutAt.length === 1) {
      // One junction on the ring: the whole ring is the single arc.
      const start = cutAt[0]
      return [intern(simplifyLine([...open.slice(start), ...open.slice(0, start), open[start]], tolerance))]
    }
    /** @type {number[]} */
    const refs = []
    for (let k = 0; k < cutAt.length; k += 1) {
      const from = cutAt[k]
      const to = cutAt[(k + 1) % cutAt.length]
      /** @type {Point[]} */
      const segment = []
      let i = from
      for (;;) {
        segment.push(open[i])
        if (i === to) break
        i = (i + 1) % n
      }
      if (segment.length >= 2) refs.push(intern(simplifyLine(segment, tolerance)))
    }
    return refs
  }

  /** @type {Array<{type: string, arcs: number[] | number[][], properties: Record<string, unknown>}>} */
  const geometries = []

  for (const shape of shapes) {
    /** @type {number[][][]} */
    const parts = []
    for (const part of shape.parts) {
      /** @type {number[][]} */
      const partArcs = []
      for (const ring of part) {
        const open = openRing(ring)
        // 3 vertices is a legal (sliver) polygon: 14 Cape/Island water tracts are
        // triangles, and dropping them would leave holes in the state.
        if (open.length < 3) continue
        const refs = cutRing(open)
        if (refs.length > 0) partArcs.push(refs)
      }
      if (partArcs.length > 0) parts.push(partArcs)
    }
    if (parts.length === 0) continue
    if (parts.length === 1) {
      geometries.push({ type: 'Polygon', arcs: parts[0], properties: shape.properties })
    } else {
      geometries.push({ type: 'MultiPolygon', arcs: parts, properties: shape.properties })
    }
  }

  // ---- 3. delta-encode ----------------------------------------------------
  const encodedArcs = arcs.map((points) => {
    let previousX = 0
    let previousY = 0
    return points.map(([x, y], i) => {
      if (i === 0) {
        previousX = x
        previousY = y
        return [x, y]
      }
      const dx = x - previousX
      const dy = y - previousY
      previousX = x
      previousY = y
      return [dx, dy]
    })
  })

  const vertexCount = arcs.reduce((sum, a) => sum + a.length, 0)
  const sourceVertices = shapes.reduce(
    (sum, s) => sum + s.parts.reduce((n, p) => n + p.reduce((m, r) => m + openRing(r).length, 0), 0),
    0,
  )

  return {
    topology: {
      type: 'Topology',
      bbox,
      transform: { scale, translate },
      objects: { [objectName]: { type: 'GeometryCollection', geometries } },
      arcs: encodedArcs,
    },
    stats: {
      shapes: geometries.length,
      arcs: arcs.length,
      vertices: vertexCount,
      sourceVertices,
      retainedShare: sourceVertices === 0 ? 0 : vertexCount / sourceVertices,
      junctions: junctions.size,
      arcReferences: internCalls,
      sharedArcReferences: internHits,
    },
  }
}

/**
 * Decode a topology back to absolute quantised rings. Used by the round-trip
 * self-check in `trim-geo.mjs`: a topology that cannot be decoded is not shipped.
 * @param {any} topology
 * @param {string} objectName
 * @returns {Ring[]}
 */
export function decodeRings(topology, objectName) {
  const { arcs, transform } = topology
  if (!Array.isArray(arcs) || !transform) throw new Error('topology missing arcs/transform')

  /** @type {Point[][]} */
  const absolute = arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map(([dx, dy], i) => {
      if (i === 0) {
        x = dx
        y = dy
      } else {
        x += dx
        y += dy
      }
      return [x, y]
    })
  })

  /** @param {number[]} refs @returns {Ring} */
  const ringOf = (refs) => {
    /** @type {Point[]} */
    const ring = []
    for (let a = 0; a < refs.length; a += 1) {
      const ref = refs[a]
      const points = ref >= 0 ? absolute[ref] : absolute[~ref].slice().reverse()
      // Only the junction shared by two consecutive arcs is deduped. Dropping
      // duplicate vertices *inside* an arc can remove the ring's closing vertex.
      const last = ring[ring.length - 1]
      const skipFirst = a > 0 && last && points[0][0] === last[0] && points[0][1] === last[1]
      for (let i = skipFirst ? 1 : 0; i < points.length; i += 1) ring.push(points[i])
    }
    return ring
  }

  /** @type {Ring[]} */
  const rings = []
  for (const geometry of topology.objects[objectName].geometries) {
    if (geometry.type === 'Polygon') {
      for (const refs of geometry.arcs) rings.push(ringOf(refs))
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.arcs) for (const refs of polygon) rings.push(ringOf(refs))
    }
  }
  return rings
}

// ------------------------------------------------------------------- geo join

/** Axis-aligned bounds of a ring set: [minX, minY, maxX, maxY]. */
export function ringBounds(rings) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

/** Even-odd ray cast across a polygon's rings (outer plus holes). */
export function pointInRings(rings, x, y) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** Flatten a GeoJSON Polygon/MultiPolygon into its ordered rings. */
export function ringsOfGeometry(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat()
  return []
}

/** Group GeoJSON rings into parts: [outer, ...holes] per polygon. */
export function partsOfGeometry(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}
