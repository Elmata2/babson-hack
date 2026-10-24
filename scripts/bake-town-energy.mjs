/**
 * @built F-75 bake real per-town energy figures, households and zonal hourly load
 *
 * Joins three public datasets to the 351 town polygons the map already draws:
 *   households  ACS 2019-2023 5-year table B11001, county subdivisions (…/households)
 *   usage  Mass Save "Town-by-Town Savings in 2023", residential MWh (data/sources/energy/usage)
 *   solar  MassCEC Production Tracking System, installed DC MW as of 2025-01-14 (…/solar)
 *   load   ISO-NE zonal demand via EIA-930, hour ending 1-24 local time, two days (…/load)
 * The CSVs are the cleaned output of scripts/energy/*.py; each parser documents its source URL.
 *
 * Output `public/data/ma-town-energy.json`:
 *   towns[TOWN]  households (ACS B11001) always set; residentialMWh and incentivesUsd (null when not reported or suppressed), usageStatus, solarMW, solarSystems
 *   load[date]   { NEMA, SEMA, WCMA }, each 24 MW values; index 0 is the hour ending 1 AM
 * The load block is no longer read by the UI (the grid clock and timeline were removed); it is baked unchanged so the data stays available.
 * Fails if any town in the geometry is missing from a CSV or has no household count, or a load day is not 3 zones x 24 hours.
 *
 * Usage:
 *   node scripts/bake-town-energy.mjs
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { kb, writeJson } from './lib/http.mjs'

const SRC = 'data/sources/energy'
const GEO = 'public/data/ma-towns.json'
const OUT = 'public/data/ma-town-energy.json'
const ZONE = { NEMASSBOST: 'NEMA', SEMASS: 'SEMA', WCMASS: 'WCMA' }
const STATUSES = ['reported', 'municipal', 'suppressed']

async function csv(path) {
  const [header, ...lines] = (await readFile(resolve(SRC, path), 'utf8')).trim().split(/\r?\n/)
  const cols = header.split(',')
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])))
}

const geo = JSON.parse(await readFile(resolve(GEO), 'utf8'))
const names = geo.features.map((f) => f.properties.town)

const usageRows = await csv('usage/towns.csv')
const solarRows = await csv('solar/solar.csv')
const usage = new Map(usageRows.map((r) => [r.town, r]))
const solar = new Map(solarRows.map((r) => [r.town, r]))
const households = new Map((await csv('households/households.csv')).map((r) => [r.town, r]))

const towns = {}
const missing = []
for (const name of names) {
  const u = usage.get(name)
  const s = solar.get(name)
  if (!u || !STATUSES.includes(u.status) || !s || s.installed_mw === '') {
    missing.push(name)
    continue
  }
  const residentialMWh = u.status === 'reported' ? Number(u.res_mwh) : null
  if (u.status === 'reported' && !Number.isFinite(residentialMWh)) {
    missing.push(name)
    continue
  }
  const incentivesUsd = u.status === 'reported' && u.res_incentives_usd !== '' ? Number(u.res_incentives_usd) : null
  if (incentivesUsd !== null && !Number.isFinite(incentivesUsd)) {
    missing.push(name)
    continue
  }
  const h = households.get(name)
  const hh = h ? Number(h.households) : NaN
  if (!Number.isInteger(hh) || hh <= 0) {
    missing.push(name)
    continue
  }
  towns[name] = { residentialMWh, incentivesUsd, households: hh, usageStatus: u.status, solarMW: Number(s.installed_mw), solarSystems: Number(s.count) }
}
if (missing.length > 0) throw new Error(`${missing.length} of ${names.length} towns lack usage, solar or household data: ${missing.join(', ')}`)

const load = {}
for (const r of await csv('load/load.csv')) {
  const zone = ZONE[r.zone]
  const hour = Number(r.hour)
  const mw = Number(r.mw)
  if (!zone || !(hour >= 1 && hour <= 24) || !Number.isFinite(mw) || r.mw === '') throw new Error(`Bad load row: ${JSON.stringify(r)}`)
  const day = (load[r.date] ??= { NEMA: Array(24).fill(null), SEMA: Array(24).fill(null), WCMA: Array(24).fill(null) })
  day[zone][hour - 1] = mw
}
for (const [date, zones] of Object.entries(load)) {
  for (const [zone, series] of Object.entries(zones)) {
    if (series.some((v) => v === null)) throw new Error(`Load ${date} ${zone} is missing hours`)
  }
}
const days = Object.keys(load).sort()
if (days.length === 0) throw new Error('No load days')

const bytes = await writeJson(OUT, {
  _meta: {
    sources: {
      usage: {
        label: 'Mass Save',
        url: 'https://www.masssave.com/about-us/2024-annual-impact-report/town-by-town-data',
        year: 2023,
        units: 'MWh per year and incentives in USD, residential only',
        note: 'Municipal light plant towns do not report to Mass Save. Two towns are suppressed for privacy.',
      },
      households: {
        label: 'Census ACS 5-year',
        url: 'https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/acsdt5y2023-b11001.dat',
        year: 2023,
        period: '2019-2023',
        units: 'households (table B11001, total), county subdivisions = MA towns',
        note: 'All occupied homes. Mass Save counts utility accounts, so usage per household is an approximation.',
      },
      solar: {
        label: 'MassCEC',
        url: 'https://www.masscec.com/sites/default/files/documents/Solar-PV-Systems-in-MA-as-of-Jan-2025.xlsx',
        asOf: '2025-01-14',
        units: 'MW DC installed',
        note: 'Production Tracking System, self-reported. SMART-only systems from 2022 to 2024 are under-captured.',
      },
      load: {
        label: 'ISO-NE via EIA-930',
        url: 'https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_SUBREGION_2026_Jan_Jun.csv',
        days,
        units: 'MW, hour ending 1 to 24, local time',
        note: 'Zonal demand as reported by ISO-NE. NEMA is NEMASSBOST, SEMA is SEMASS, WCMA is WCMASS.',
      },
    },
  },
  towns,
  load,
})
console.log(`${OUT}: ${names.length} towns, ${days.length} load days, ${kb(bytes)}`)
