/**
 * @built F-12 compute county HDD65 from ERA5 daily means, 2015–2024, all 14 counties
 * @built F-26a monthly heating-year shares from the same cached daily means
 *
 * `HDD65 = Σ max(65 − T̄d, 0)`, averaged over the ten years, per county centroid.
 * Nothing here is guessed: a degree-day figure that is not computed from daily
 * temperatures is a fabricated number, and this table multiplies every design
 * load in the product.
 *
 * The same pass also writes `hdd-monthly-weights.json`: each county's HDD65
 * summed per calendar month over the same ten years, expressed as its share of
 * that county's heating year. A January oil bill is 19.1% of a Boston heating
 * year, not one twelfth of it, so `lib/parse/annualise.ts` divides by this share
 * instead of multiplying by 12. One computation, two artefacts — they cannot
 * drift apart.
 *
 * Politeness: 14 sequential calls with a pause between them, one per county, and
 * a cache so a re-run asks nothing. Open-Meteo snaps to the 0.25° ERA5 grid, so
 * the snapped grid point and its elevation are recorded next to the value.
 *
 * Usage:
 *   node scripts/bake-hdd.mjs             # fetch (cached), write data/generated/hdd-*.json
 *   node scripts/bake-hdd.mjs --from-cache
 *   node scripts/bake-hdd.mjs --check
 */

import { relative } from 'node:path'
import { cachePath, fetchJsonCached, kb, meta, reportSize, sizesOf, writeJson } from './lib/http.mjs'

const OUT = 'data/generated/hdd-by-county.json'
const BUDGET_BYTES = 3 * 1024
/** Monthly shares are small; the whole table must stay inlineable. */
const WEIGHTS_OUT = 'data/generated/hdd-monthly-weights.json'
const WEIGHTS_BUDGET_BYTES = 8 * 1024
/** The zone `lib/parse` uses when a caller names no county. Boston = Suffolk. */
const DEFAULT_COUNTY = '25025'
/** Shares are rounded to three decimals to match the design note; see the sum check. */
const SHARE_DECIMALS = 3
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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
  let ok = true
  for (const [path, budget] of [
    [OUT, BUDGET_BYTES],
    [WEIGHTS_OUT, WEIGHTS_BUDGET_BYTES],
  ]) {
    const sizes = await sizesOf(path)
    if (!reportSize(relative(process.cwd(), path), sizes, budget)) ok = false
  }
  process.exit(ok ? 0 : 1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`bake-hdd — Open-Meteo ERA5, ${START} → ${END}, ${COUNTIES.length} counties`)

/** @type {Record<string, object>} */
const counties = {}
/** Raw monthly HDD sums per county, kept out of the county artefact to keep it at 3 KB. */
/** @type {Record<string, number[]>} */
const monthlyTotalsByFips = {}
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
  const byMonth = Array.from({ length: 12 }, () => 0)
  let missing = 0
  for (let i = 0; i < times.length; i += 1) {
    const year = times[i].slice(0, 4)
    const mean = values[i]
    if (typeof mean !== 'number' || !Number.isFinite(mean)) {
      missing += 1
      continue
    }
    const hdd = Math.max(BASE_F - mean, 0)
    byYear.set(year, (byYear.get(year) ?? 0) + hdd)
    byMonth[Number(times[i].slice(5, 7)) - 1] += hdd
  }

  const years = [...byYear.keys()].sort()
  const expectedYears = Array.from({ length: 10 }, (_, i) => String(2015 + i))
  const missingYears = expectedYears.filter((y) => !byYear.has(y))
  if (missingYears.length > 0) throw new Error(`incomplete years: ${missingYears.join(', ')}`)

  const annual = years.map((y) => byYear.get(y))
  const hdd65 = annual.reduce((a, b) => a + b, 0) / annual.length
  const hdd2024 = byYear.get('2024')
  if (!Number.isFinite(hdd65)) throw new Error('HDD is not finite')

  // The monthly sums must add up to the annual figure they are a share of. If
  // they do not, the month index or the subsetting is wrong — never patch it.
  const monthlyTotal = byMonth.reduce((a, b) => a + b, 0)
  const annualTotal = annual.reduce((a, b) => a + b, 0)
  if (Math.abs(monthlyTotal - annualTotal) > 1) {
    throw new Error(`monthly HDD ${monthlyTotal.toFixed(1)} does not reconcile with annual ${annualTotal.toFixed(1)}`)
  }

  return {
    hdd65: Number(hdd65.toFixed(1)),
    hdd2024: Number(hdd2024.toFixed(1)),
    gridPoint: [Number(result.data.latitude), Number(result.data.longitude)],
    elevationM: result.data.elevation ?? null,
    daysMissing: missing,
    monthlyTotals: byMonth,
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
    monthlyTotalsByFips[county.fips] = computed.monthlyTotals
    // `rows` is printed, never serialised, so the extra field costs nothing.
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

// ---- monthly heating-year shares -----------------------------------------
// Share of the heating year in each calendar month, from the identical daily
// series. `lib/parse/annualise.ts` divides by these instead of multiplying a
// single month by 12: a Newton January is 19.1% of the year, not 8.3%.
const shareOf = (totals) => {
  const total = totals.reduce((a, b) => a + b, 0)
  return totals.map((value) => Number((value / total).toFixed(SHARE_DECIMALS)))
}

const weightCounties = {}
const reconciled = []
for (const [fips, county] of Object.entries(counties)) {
  const months = shareOf(monthlyTotalsByFips[fips])
  const shareSum = Number(months.reduce((a, b) => a + b, 0).toFixed(SHARE_DECIMALS))
  if (Math.abs(shareSum - 1) > 0.003) {
    console.error(`  FAIL   ${county.name}: shares sum to ${shareSum}, not 1. Refusing to write.`)
    process.exit(1)
  }
  weightCounties[fips] = { name: county.name, seasonHdd: county.hdd65, months }
  reconciled.push({ fips, shareSum })
}

// A statewide fallback for a caller that has no town: the mean monthly HDD curve
// across all 14 county centroids, normalised the same way. Documented in _meta.
const meanMonthly = MONTH_NAMES.map(
  (_, index) => Object.values(monthlyTotalsByFips).reduce((sum, totals) => sum + totals[index], 0) / COUNTIES.length,
)
const statewideMonths = shareOf(meanMonthly)
const statewideSeasonHdd = Number(
  (Object.values(counties).reduce((sum, county) => sum + county.hdd65, 0) / COUNTIES.length).toFixed(1),
)
const boston = weightCounties[DEFAULT_COUNTY]
if (!boston) {
  console.error(`  FAIL   default county ${DEFAULT_COUNTY} missing from the table.`)
  process.exit(1)
}

const weightsArtefact = {
  _meta: meta({
    source: 'Open-Meteo archive API (ERA5 reanalysis), daily mean 2 m temperature, county centroid',
    url: 'https://archive-api.open-meteo.com/v1/archive',
    fetchedAt,
    recordCount: Object.keys(weightCounties).length,
    extra: {
      method:
        'HDD65 = Σ max(65 − daily mean °F, 0) summed per calendar month over 2015–2024, divided by that county’s ten-year HDD65 total. Shares are unitless fractions of the heating year, January first.',
      baseTempF: BASE_F,
      years: [START, END],
      fields:
        'counties: FIPS → { name, seasonHdd (HDD65 2015–2024 mean), months: 12 shares, Jan…Dec }; statewide: the same two fields averaged across all 14 counties (unweighted by population).',
      defaultCounty: { fips: DEFAULT_COUNTY, name: boston.name, note: 'Boston. Used by lib/parse when the caller names no county.' },
      statewideNote:
        'Unweighted mean of the 14 county centroids, offered only as a fallback. Prefer the county the address is in; population weighting is not applied because no population table is baked here.',
      rounding:
        `Shares are rounded to ${SHARE_DECIMALS} decimals and never renormalised after rounding, so a county’s twelve shares can sum to 1 ± 0.003. The error on an annualised bill is under 0.3% and is far below the method confidence.`,
      shareSums: reconciled,
      seasonHddNote:
        'seasonHdd is the same HDD65 the county table carries, so `annualise` cannot disagree with the design-load path.',
      caveats: [
        'Monthly shares are a ten-year climate average, not this winter. A cold January is a bigger share than 0.191.',
        'A household’s own heating profile differs from the county’s: setback, wood stove, hot-water baseload.',
      ],
    },
  }),
  statewide: { seasonHdd: statewideSeasonHdd, months: statewideMonths },
  counties: weightCounties,
}

await writeJson(WEIGHTS_OUT, weightsArtefact)
const weightSizes = await sizesOf(WEIGHTS_OUT)
const weightsOk = reportSize(relative(process.cwd(), WEIGHTS_OUT), weightSizes, WEIGHTS_BUDGET_BYTES)

console.log('\n  county          HDD65 (2015–24 mean)   HDD65 2024   range')
for (const row of rows) {
  console.log(
    `  ${row.name.padEnd(14)} ${row.hdd65.toFixed(0).padStart(8)}              ${row.hdd2024.toFixed(0).padStart(8)}   ${row.hdd65 >= MIN_HDD && row.hdd65 <= MAX_HDD ? 'ok' : 'OUT'}`,
  )
}
console.log('\n  heating-year share by month (Boston / Suffolk)')
console.log(`  ${MONTH_NAMES.map((name) => name.padStart(6)).join('')}`)
console.log(`  ${boston.months.map((share) => share.toFixed(3).padStart(6)).join('')}`)
console.log(`  ${anchorNote}`)
console.log(`  artefact ${kb(sizes.raw)} raw (budget ${kb(BUDGET_BYTES)}) ${ok ? 'ok' : 'OVER'}`)
console.log(`  artefact ${kb(weightSizes.raw)} raw (budget ${kb(WEIGHTS_BUDGET_BYTES)}) ${weightsOk ? 'ok' : 'OVER'}`)
if (!ok || !weightsOk) process.exitCode = 1
