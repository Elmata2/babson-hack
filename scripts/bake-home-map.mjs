/**
 * Bake the static home-page backdrop `public/home-map.svg`.
 *
 * Source: US Census Bureau cartographic boundary file `cb_2023_25_cousub_500k` (2023, 1:500k,
 * clipped to the shoreline), Massachusetts county subdivisions = towns. Water-only features
 * (ALAND = 0) are dropped. Projected equirectangular (longitude scaled by the cosine of the
 * state's mid-latitude), one warm tint, thin paper-coloured outlines. It carries no data on
 * purpose: it is texture, not a chart.
 *
 * Usage: node scripts/bake-home-map.mjs [path/to/cb_2023_25_cousub_500k]   (path without extension)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SOURCE_URL = 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_25_cousub_500k.zip'
const TINT = '#ebc99d'
const OUTLINE = '#fbfaf7'
const WIDTH = 1000
const MAX_BYTES = 400 * 1024

const base = process.argv[2]
if (!base) {
  console.error(`Usage: node scripts/bake-home-map.mjs <extracted shapefile path without extension>\nSource: ${SOURCE_URL}`)
  process.exit(1)
}

function readShp(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out = []
  let o = 100
  while (o + 8 <= buf.length) {
    const len = v.getInt32(o + 4) * 2
    const rec = o + 8
    const type = v.getInt32(rec, true)
    if (type === 5) {
      const nParts = v.getInt32(rec + 36, true)
      const nPts = v.getInt32(rec + 40, true)
      const parts = []
      for (let i = 0; i < nParts; i++) parts.push(v.getInt32(rec + 44 + i * 4, true))
      const pts0 = rec + 44 + nParts * 4
      const rings = parts.map((s, i) => {
        const e = i + 1 < nParts ? parts[i + 1] : nPts
        const ring = []
        for (let k = s; k < e; k++) ring.push([v.getFloat64(pts0 + k * 16, true), v.getFloat64(pts0 + k * 16 + 8, true)])
        return ring
      })
      out.push(rings)
    } else if (type !== 0) throw new Error(`unexpected shape type ${type}`)
    else out.push(null)
    o = rec + len
  }
  return out
}

function readDbf(buf) {
  const n = buf.readUInt32LE(4)
  const hLen = buf.readUInt16LE(8)
  const rLen = buf.readUInt16LE(10)
  const fields = []
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] })
  }
  const rows = []
  for (let i = 0; i < n; i++) {
    let o = hLen + i * rLen + 1
    const row = {}
    for (const f of fields) {
      row[f.name] = buf.toString('utf8', o, o + f.len).trim()
      o += f.len
    }
    rows.push(row)
  }
  return rows
}

const shapes = readShp(await readFile(`${base}.shp`))
const attrs = readDbf(await readFile(`${base}.dbf`))
if (shapes.length !== attrs.length) throw new Error('shp/dbf record count mismatch')

const towns = shapes
  .map((rings, i) => ({ rings, a: attrs[i] }))
  .filter((t) => t.rings && Number(t.a.ALAND) > 0 && !/not defined/i.test(t.a.NAME))

const EXPECTED_TOWNS = 351
if (towns.length !== EXPECTED_TOWNS) {
  const kept = new Set(towns.map((t) => t.a.GEOID))
  const dropped = attrs.filter((a) => !kept.has(a.GEOID)).map((a) => a.NAME)
  throw new Error(`expected ${EXPECTED_TOWNS} towns, got ${towns.length}; dropped: ${dropped.join(', ')}`)
}

const all = towns.flatMap((t) => t.rings.flat())
const minX = Math.min(...all.map((p) => p[0]))
const maxX = Math.max(...all.map((p) => p[0]))
const minY = Math.min(...all.map((p) => p[1]))
const maxY = Math.max(...all.map((p) => p[1]))
const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
const PAD = 4
const scale = (WIDTH - 2 * PAD) / ((maxX - minX) * kx)
const HEIGHT = Math.ceil((maxY - minY) * scale + 2 * PAD)
const px = ([x, y]) => [
  Math.round(((x - minX) * kx * scale + PAD) * 10) / 10,
  Math.round(((maxY - y) * scale + PAD) * 10) / 10,
]

function ringPath(ring) {
  const pts = ring.map(px)
  const deltas = []
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.round((pts[i][0] - pts[i - 1][0]) * 10) / 10
    const dy = Math.round((pts[i][1] - pts[i - 1][1]) * 10) / 10
    if (dx !== 0 || dy !== 0) deltas.push(dx, dy)
  }
  return deltas.length < 4 ? '' : `M${pts[0][0]} ${pts[0][1]}l${deltas.join(' ')}z`
}

const d = towns.flatMap((t) => t.rings.map(ringPath)).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="${TINT}" fill-rule="evenodd" stroke="${OUTLINE}" stroke-width="0.5" stroke-linejoin="round"><path d="${d}"/></svg>\n`

const bytes = Buffer.byteLength(svg)
if (bytes > MAX_BYTES) throw new Error(`home-map.svg is ${bytes} bytes, limit ${MAX_BYTES}`)
await writeFile(resolve('public/home-map.svg'), svg)
console.log(`home-map.svg ${(bytes / 1024).toFixed(1)} KB, ${WIDTH}x${HEIGHT}, ${towns.length} towns (of ${shapes.length} features)`)
