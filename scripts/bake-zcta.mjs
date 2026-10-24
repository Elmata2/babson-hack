/**
 * @built F-70 bake Massachusetts ZIP code (ZCTA) centroids for ZIP search on /map
 *
 * The Census geocoder only matches full street addresses, so "02482" alone
 * returns nothing. The Census Gazetteer publishes one internal point per ZCTA;
 * we keep the Massachusetts ones and resolve each to its town by
 * point-in-polygon against `public/data/ma-towns.json`, the same boundaries the
 * map draws. The national file has no state column: MA ZIPs are 010xx–027xx (plus
 * 055xx for Andover IRS), and the point-in-polygon step drops anything outside MA.
 *
 * A ZCTA can span towns. We store the town its internal point lands in and let
 * the UI say "this ZIP covers parts of more than one town" when the user disagrees.
 *
 * Usage:
 *   node scripts/bake-zcta.mjs          # download, unzip, write the artefact
 *   node scripts/bake-zcta.mjs --check  # sizes only
 */

import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { kb, meta, reportSize, sizesOf, writeJson } from './lib/http.mjs'
import { pointInRings, ringsOfGeometry } from './lib/geo.mjs'

const URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip'
const OUT = 'data/generated/ma-zcta.json'
const BUDGET_BYTES = 24 * 1024

if (process.argv.includes('--check')) {
  const sizes = await sizesOf(OUT)
  reportSize(relative(process.cwd(), OUT), sizes, BUDGET_BYTES)
  process.exit(sizes.raw <= BUDGET_BYTES ? 0 : 1)
}

const towns = JSON.parse(await readFile(resolve('public/data/ma-towns.json'), 'utf8'))
const townRings = towns.features.map((f) => ({ town: f.properties.town, rings: ringsOfGeometry(f.geometry) }))

const dir = await mkdtemp(join(tmpdir(), 'zcta-'))
const zip = join(dir, 'zcta.zip')
const res = await fetch(URL)
if (!res.ok) throw new Error(`Gazetteer download failed: ${res.status}`)
await writeFile(zip, Buffer.from(await res.arrayBuffer()))
const text = execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const [header, ...rows] = text.trim().split('\n')
const cols = header.split('\t').map((c) => c.trim())
const iZip = cols.indexOf('GEOID')
const iLat = cols.indexOf('INTPTLAT')
const iLon = cols.indexOf('INTPTLONG')
if (iZip < 0 || iLat < 0 || iLon < 0) throw new Error(`Unexpected gazetteer header: ${cols.join(',')}`)

/** zip → [lon, lat, TOWN] */
const zips = {}
for (const row of rows) {
  const c = row.split('\t').map((v) => v.trim())
  const code = c[iZip]
  if (!/^(0[12]\d{3}|055\d{2})$/.test(code)) continue
  const lat = Number(c[iLat])
  const lon = Number(c[iLon])
  const hit = townRings.find((t) => pointInRings(t.rings, lon, lat))
  if (!hit) continue
  zips[code] = [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, hit.town]
}

const count = Object.keys(zips).length
const bytes = await writeJson(OUT, {
  _meta: meta({
    source: 'US Census Bureau 2024 Gazetteer — ZIP Code Tabulation Areas (internal points)',
    url: URL,
    recordCount: count,
    extra: {
      format: '{ zip: [lon, lat, TOWN] }, town by point-in-polygon against public/data/ma-towns.json',
      caveat: 'A ZCTA approximates a USPS ZIP and can span towns; the town is where its internal point lands.',
    },
  }),
  zips,
})
console.log(`${OUT}: ${count} ZCTAs, ${kb(bytes)}`)
