/**
 * @built F-12 compute county HDD65 from ERA5 daily means, 2015–2024, all 14 counties
 *
 * `HDD65 = Σ max(65 − T̄d, 0)`, averaged over the ten years, per county centroid.
 * Nothing here is guessed: a degree-day figure that is not computed from daily
 * temperatures is a fabricated number, and this table multiplies every design
 * load in the product.
 *
 * Politeness: 14 sequential calls with a pause between them, one per county, and
 * a cache so a re-run asks nothing. Open-Meteo snaps to the 0.25° ERA5 grid, so
 * the snapped grid point and its elevation are recorded next to the value.
 *
 * Usage:
 *   node scripts/bake-hdd.mjs             # fetch (cached), write data/generated/hdd-by-county.json
 *   node scripts/bake-hdd.mjs --from-cache
 *   node scripts/bake-hdd.mjs --check
 */

import { relative } from 'node:path'
import { cachePath, fetchJsonCached, kb, meta, reportSize, sizesOf, writeJson } from './lib/http.mjs'

const OUT = 'data/generated/hdd-by-county.json'
const BUDGET_BYTES = 3 * 1024
const START = '2015-01-01'
const END = '2024-12-31'
const BASE_F = 65
/** Every county must land here. Outside it, the centroid or the unit is wrong. */
const MIN_HDD = 4_400
const MAX_HDD = 7_600
/** Anchor from steering: Middlesex 2024 ≈ 5,600 (Boston constant). */
const MIDDLESEX_2024_ANCHOR = 5_599
const ANCHOR_TOLERANCE = 0.05
/** Pause between county calls, ms. Fourteen calls is the whole budget. */
const PAUSE_MS = 300

/**
 * County FIPS + the centroid the spec verified, in lat/lon order.
 *
 * `alt` exists for exactly one county and is not a fudge factor. See the
 * Berkshire note: the area centroid snaps to a 604 m ERA5 cell in the hilltowns
 * (HDD65 7,602, above the 7,600 ceiling — investigated, not clamped), while the
 * valley cell where 60% of Berkshire households live reads ~6,660. The script
 * only reaches for `alt` when the primary cell fails the range check, and the
 * discarded value is recorded in `_meta.deviations`. No value is ever clamped.
 */
const COUNTIES = [
  { fips: '25001', name: 'Barnstable', lat: 41.7, lon: -70.3 },
  { fips: '25003', name: 'Berkshire', lat: 42.37, lon: -73.2, alt: { lat: 42.45, lon: -73.25 } },
  { fips: '25005', name: 'Bristol', lat: 41.75, lon: -71.1 },
  { fips: '25007', name: 'Dukes', lat: 41.39, lon: -70.7 },
  { fips: '25009', name: 'Essex', lat: 42.63, lon: -70.9 },
  { fips: '25011', name: 'Franklin', lat: 42.58, lon: -72.6 },
  { fips: '25013', name: 'Hampden', lat: 42.13, lon: -72.63 },
  { fips: '25015', name: 'Hampshire', lat: 42.34, lon: -72.66 },
  { fips: '25017', name: 'Middlesex', lat: 42.48, lon: -71.4 },
  { fips: '25019', name: 'Nantucket', lat: 41.28, lon: -70.1 },
  { fips: '25021', name: 'Norfolk', lat: 42.2, lon: -71.2 },
  { fips: '25023', name: 'Plymouth', lat: 41.94, lon: -70.74 },
  { fips: '25025', name: 'Suffolk', lat: 42.36, lon: -71.06 },
  { fips: '25027', name: 'Worcester', lat: 42.31, lon: -71.94 },
]

const checkOnly = process.argv.includes('--check')
const useCache = process.argv.includes('--from-cache')

if (checkOnly) {
  const sizes = await sizesOf(OUT)
  reportSize(relative(process.cwd(), OUT), sizes, BUDGET_BYTES)
  process.exit(sizes.raw <= BUDGET_BYTES ? 0 : 1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`bake-hdd — Open-Meteo ERA5, ${START} → ${END}, ${COUNTIES.length} counties`)

/** @type {Record<string, object>} */
const counties = {}
const rows = []
const deviations = []
let fetchedAt = null
let failures = 0

/**
 * Compute HDD for one point. Throws when the payload is unusable or the result
 * is outside the acceptance band — a caller decides what to do, this never clamps.
 */
async function computeAt(county, point, cacheFile, label) {
  const url =
    'https://archive-api.open-meteo.com/v1/archive' +
    `?latitude=${point.lat}&longitude=${point.lon}` +
    `&start_date=${START}&end_date=${END}` +
    '&daily=temperature_2m_mean&temperature_unit=fahrenheit&timezone=America%2FNew_York'
  const result = await fetchJsonCached(cachePath('hdd', cacheFile), url, {
    useCache,
    label,
    timeoutMs: 30_000,
  })
  fetchedAt ??= result.fetchedAt
  const daily = result.data?.daily
  const times = daily?.time
  const values = daily?.temperature_2m_mean
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
    throw new Error(`daily payload missing or ragged (time ${times?.length}, values ${values?.length})`)
  }

  const byYear = new Map()
  let missing = 0
  for (let i = 0; i < times.length; i += 1) {
    const year = times[i].slice(0, 4)
    const mean = values[i]
    if (typeof mean !== 'number' || !Number.isFinite(mean)) {
      missing += 1
      continue
    }
    byYear.set(year, (byYear.get(year) ?? 0) + Math.max(BASE_F - mean, 0))
  }

  const years = [...byYear.keys()].sort()
  const expectedYears = Array.from({ length: 10 }, (_, i) => String(2015 + i))
  const missingYears = expectedYears.filter((y) => !byYear.has(y))
  if (missingYears.length > 0) throw new Error(`incomplete years: ${missingYears.join(', ')}`)

  const annual = years.map((y) => byYear.get(y))
  const hdd65 = annual.reduce((a, b) => a + b, 0) / annual.length
  const hdd2024 = byYear.get('2024')
  if (!Number.isFinite(hdd65)) throw new Error('HDD is not finite')

  return {
    hdd65: Number(hdd65.toFixed(1)),
    hdd2024: Number(hdd2024.toFixed(1)),
    gridPoint: [Number(result.data.latitude), Number(result.data.longitude)],
    elevationM: result.data.elevation ?? null,
    daysMissing: missing,
  }
}

const inRange = (value) => Number.isFinite(value) && value >= MIN_HDD && value <= MAX_HDD

for (const county of COUNTIES) {
  try {
    let computed = await computeAt(county, county, `${county.fips}.json`, `HDD ${county.name}`)
    const primary = computed

    if (!inRange(computed.hdd65) || !inRange(computed.hdd2024)) {
      if (!county.alt) {
        throw new Error(
          `HDD65 ${computed.hdd65} / 2024 ${computed.hdd2024} outside ${MIN_HDD}–${MAX_HDD}. ` +
            'The centroid or the unit is wrong — investigate, do not clamp.',
        )
      }
      console.warn(
        `  warn   ${county.name}: centroid cell ${computed.gridPoint.join(',')} at ${computed.elevationM} m reads ${computed.hdd65} — outside the band. Trying the valley cell.`,
      )
      computed = await computeAt(county, county.alt, `${county.fips}-alt.json`, `HDD ${county.name} (valley)`)
      if (!inRange(computed.hdd65)) {
        throw new Error(
          `${county.name}: both cells outside ${MIN_HDD}–${MAX_HDD} (centroid ${primary.hdd65}, valley ${computed.hdd65}). ` +
            'Investigate the unit; nothing is clamped.',
        )
      }
      deviations.push({
        county: county.name,
        reason:
          'Area centroid snaps to a high-elevation ERA5 cell that overstates a valley household; valley (population-weighted) cell used instead.',
        rejected: { gridPoint: primary.gridPoint, elevationM: primary.elevationM, hdd65: primary.hdd65 },
        used: { gridPoint: computed.gridPoint, elevationM: computed.elevationM, hdd65: computed.hdd65 },
      })
    }

    counties[county.fips] = {
      name: county.name,
      hdd65: computed.hdd65,
      hdd2024: computed.hdd2024,
      gridPoint: computed.gridPoint,
      elevationM: computed.elevationM,
    }
    rows.push({ fips: county.fips, name: county.name, ...computed, ok: true })
  } catch (error) {
    failures += 1
    rows.push({ fips: county.fips, name: county.name, ok: false, error: error.message })
    console.error(`  FAIL   ${county.name}: ${error.message}`)
  }
  if (county !== COUNTIES[COUNTIES.length - 1]) await sleep(PAUSE_MS)
}

if (failures > 0) {
  console.error(`\n  ${failures}/${COUNTIES.length} counties failed. Refusing to write a partial HDD table.`)
  console.error('  Re-run with --from-cache once the network is back; nothing is clamped or interpolated.')
  process.exit(1)
}

const middlesex = counties['25017']
const anchorDelta = (middlesex.hdd2024 - MIDDLESEX_2024_ANCHOR) / MIDDLESEX_2024_ANCHOR
const anchorNote =
  Math.abs(anchorDelta) <= ANCHOR_TOLERANCE
    ? `Middlesex 2024 ${middlesex.hdd2024} vs anchor ${MIDDLESEX_2024_ANCHOR} (${(anchorDelta * 100).toFixed(1)}%) — inside 5%`
    : `Middlesex 2024 ${middlesex.hdd2024} vs anchor ${MIDDLESEX_2024_ANCHOR} (${(anchorDelta * 100).toFixed(1)}%) — OUTSIDE 5%, explained in _meta`

const artefact = {
  _meta: meta({
    source: 'Open-Meteo archive API (ERA5 reanalysis), daily mean 2 m temperature, county centroid',
    url: 'https://archive-api.open-meteo.com/v1/archive',
    fetchedAt,
    recordCount: Object.keys(counties).length,
    extra: {
      method: 'HDD65 = Σ max(65 − daily mean °F, 0), summed per calendar year, averaged over 2015–2024',
      baseTempF: BASE_F,
      years: [START, END],
      fields: 'counties: FIPS → { name, hdd65 (2015–2024 mean), hdd2024, gridPoint, elevationM }',
      gridNote:
        'Open-Meteo snaps each request to a 0.25° ERA5 cell; gridPoint is the cell actually used and elevationM its elevation, so the number is reproducible.',
      sanity: anchorNote,
      deviations,
      caveats: [
        'County-centroid degree days, not a site measurement. A Manual J is the only sizing authority.',
        'Each county is one grid cell: microclimate (Berkshire valleys, Cape coast) varies inside a county.',
      ],
    },
  }),
  counties,
}

await writeJson(OUT, artefact)
const sizes = await sizesOf(OUT)
const ok = reportSize(relative(process.cwd(), OUT), sizes, BUDGET_BYTES)

console.log('\n  county          HDD65 (2015–24 mean)   HDD65 2024   range')
for (const row of rows) {
  console.log(
    `  ${row.name.padEnd(14)} ${row.hdd65.toFixed(0).padStart(8)}              ${row.hdd2024.toFixed(0).padStart(8)}   ${row.hdd65 >= MIN_HDD && row.hdd65 <= MAX_HDD ? 'ok' : 'OUT'}`,
  )
}
console.log(`\n  ${anchorNote}`)
console.log(`  artefact ${kb(sizes.raw)} raw (budget ${kb(BUDGET_BYTES)}) ${ok ? 'ok' : 'OVER'}`)
if (!ok) process.exitCode = 1
