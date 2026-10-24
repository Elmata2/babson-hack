/**
 * @built F-71 plain-GeoJSON helpers for the map: centroid, anchor, area, point-in-polygon
 *
 * Pure and dependency-free. Rings are `[lng, lat]`; a polygon is `[outer, ...holes]`.
 */

export type Ring = number[][]
export type PolygonCoords = Ring[]
export interface AreaGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export function polygonsOf(geometry: AreaGeometry): PolygonCoords[] {
  return geometry.type === 'Polygon' ? [geometry.coordinates as PolygonCoords] : (geometry.coordinates as PolygonCoords[])
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inPolygon(x: number, y: number, rings: PolygonCoords): boolean {
  return inRing(x, y, rings[0]) && !rings.slice(1).some((hole) => inRing(x, y, hole))
}

export function geometryHas(geometry: AreaGeometry, x: number, y: number): boolean {
  return polygonsOf(geometry).some((polygon) => inPolygon(x, y, polygon))
}

/** Mean of the outer-ring vertices, the mock model's "where the load is". */
export function centroidOf(geometry: AreaGeometry): [number, number] {
  const points = polygonsOf(geometry).flatMap((polygon) => polygon[0])
  let sx = 0
  let sy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
  }
  return [sx / points.length, sy / points.length]
}

function ringArea(ring: Ring): number {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(area / 2)
}

/** Planar area in km², equirectangular at the polygon's own latitude. Good to a few percent. */
export function areaKm2(geometry: AreaGeometry): number {
  let total = 0
  for (const polygon of polygonsOf(geometry)) {
    const lat = polygon[0].reduce((sum, p) => sum + p[1], 0) / polygon[0].length
    const kx = 111.32 * Math.cos((lat * Math.PI) / 180)
    const holes = polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)
    total += (ringArea(polygon[0]) - holes) * kx * 110.57
  }
  return total
}

/** A point guaranteed inside the geometry: bbox centre, else the inside grid point nearest the largest ring's mean. */
export function anchorOf(geometry: AreaGeometry): [number, number] {
  const all = polygonsOf(geometry).flatMap((polygon) => polygon[0])
  const xs = all.map((c) => c[0])
  const ys = all.map((c) => c[1])
  const centre: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  if (geometryHas(geometry, centre[0], centre[1])) return centre
  const biggest = polygonsOf(geometry).reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a))
  const ring = biggest[0]
  const mx = ring.reduce((s, c) => s + c[0], 0) / ring.length
  const my = ring.reduce((s, c) => s + c[1], 0) / ring.length
  const rx = ring.map((c) => c[0])
  const ry = ring.map((c) => c[1])
  const x0 = Math.min(...rx)
  const x1 = Math.max(...rx)
  const y0 = Math.min(...ry)
  const y1 = Math.max(...ry)
  let best: [number, number] | null = null
  let bestDist = Infinity
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      const x = x0 + ((x1 - x0) * i) / 24
      const y = y0 + ((y1 - y0) * j) / 24
      const d = Math.hypot(x - mx, y - my)
      if (d < bestDist && inPolygon(x, y, biggest)) {
        bestDist = d
        best = [x, y]
      }
    }
  }
  return best ?? [mx, my]
}

/** Bounding box `[w, s, e, n]` of every vertex. */
export function bboxOf(geometry: AreaGeometry): [number, number, number, number] {
  const all = polygonsOf(geometry).flatMap((polygon) => polygon[0])
  const xs = all.map((c) => c[0])
  const ys = all.map((c) => c[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
