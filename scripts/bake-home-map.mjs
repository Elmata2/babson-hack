/**
 * Bake the static home-page backdrop `public/home-map.svg`.
 *
 * The 351 town polygons from `ma-towns.json`, projected equirectangular (longitude
 * scaled by the cosine of the state's mid-latitude), in one neutral warm tint with thin
 * paper-coloured outlines. It carries no data on purpose: it is texture, not a chart.
 *
 * Usage: node scripts/bake-home-map.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const TINT = '#f0d5ac'
const OUTLINE = '#fbfaf7'
const WIDTH = 1000
const MAX_BYTES = 400 * 1024

const towns = JSON.parse(await readFile(resolve('public/data/ma-towns.json'), 'utf8')).features
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)

const all = towns.flatMap((t) => rings(t.geometry).flatMap((p) => p[0]))
const minX = Math.min(...all.map((p) => p[0]))
const maxX = Math.max(...all.map((p) => p[0]))
const minY = Math.min(...all.map((p) => p[1]))
const maxY = Math.max(...all.map((p) => p[1]))
const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
const scale = WIDTH / ((maxX - minX) * kx)
const HEIGHT = Math.ceil((maxY - minY) * scale)
const px = ([x, y]) => [
  Math.round((x - minX) * kx * scale * 10) / 10,
  Math.round((maxY - y) * scale * 10) / 10,
]

function ringPath(ring) {
  const pts = ring.map(px)
  const deltas = []
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = Math.round((pts[i][0] - pts[i - 1][0]) * 10) / 10
    const dy = Math.round((pts[i][1] - pts[i - 1][1]) * 10) / 10
    if (dx !== 0 || dy !== 0) deltas.push(dx, dy)
  }
  return `M${pts[0][0]} ${pts[0][1]}l${deltas.join(' ')}z`
}

const d = towns.flatMap((t) => rings(t.geometry).flatMap((p) => p.map(ringPath))).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="${TINT}" fill-rule="evenodd" stroke="${OUTLINE}" stroke-width="0.8" stroke-linejoin="round"><path d="${d}"/></svg>\n`

const bytes = Buffer.byteLength(svg)
if (bytes > MAX_BYTES) throw new Error(`home-map.svg is ${bytes} bytes, limit ${MAX_BYTES}`)
await writeFile(resolve('public/home-map.svg'), svg)
console.log(`home-map.svg ${(bytes / 1024).toFixed(1)} KB, ${WIDTH}x${HEIGHT}, ${towns.length} towns`)
