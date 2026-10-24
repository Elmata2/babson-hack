/**
 * @built F-60 bake every Massachusetts electric sponsor from MassGIS, all 351 towns
 *
 * Source (verified live 2026-10-24): the organizers' portal dataset
 * `AGOL/ElectricityProviders/MapServer/0`, which returns `count: 351`.
 *
 * The trap is `ELEC_LABEL`: 17 towns are a comma-joined list, and one of the
 * eight distinct labels is `"Municipal"` alone. Parsing therefore lives in
 * `lib/elec-label.ts` and is imported here directly (Node ≥ 22.18 strips types),
 * so the bake and the runtime gate are the same code path. `mixed` is wider than
 * the spec's "municipal + IOU": eight towns list two IOUs, where the seasonal
 * rate rule differs by three cents and a single answer would be a guess.
 *
 * Usage:
 *   node scripts/bake-utilities.mjs            # fetch (cached), write the artefact
 *   node scripts/bake-utilities.mjs --from-cache
 *   node scripts/bake-utilities.mjs --check    # sizes only, writes nothing
 */

import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { cachePath, fetchJsonCached, kb, meta, reportSize, sizesOf, writeJson } from './lib/http.mjs'

/** Node strips TypeScript types from 22.18 on. Check before the import fails obscurely. */
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  throw new Error(
    `bake-utilities needs Node ≥ 22.18 to import lib/elec-label.ts directly (this is ${process.versions.node}).`,
  )
}

const { parseElecLabel, titleCaseTown, townKey } = await import('../lib/elec-label.ts')

const URL =
  'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0/query' +
  '?where=1%3D1&outFields=TOWN,ELEC,ELEC_LABEL&returnGeometry=false&f=json'
const CACHE = cachePath('electricity-providers.json')
const OUT = 'data/generated/utilities.json'
const BUDGET_BYTES = 30 * 1024
const EXPECTED_TOWNS = 351

const checkOnly = process.argv.includes('--check')
const useCache = process.argv.includes('--from-cache')

if (checkOnly) {
  const sizes = await sizesOf(OUT)
  reportSize(relative(process.cwd(), OUT), sizes, BUDGET_BYTES)
  process.exit(sizes.raw <= BUDGET_BYTES ? 0 : 1)
}

console.log('bake-utilities — MassGIS ElectricityProviders, 351 towns')
const result = await fetchJsonCached(CACHE, URL, { useCache, label: 'ElectricityProviders' })
const features = result.data?.features
if (!Array.isArray(features)) throw new Error('ElectricityProviders: response has no features[]')
if (features.length !== EXPECTED_TOWNS) {
  throw new Error(`ElectricityProviders: expected ${EXPECTED_TOWNS} towns, got ${features.length}`)
}

/** @type {Record<string, {sponsors: string[], hasMunicipal: boolean, mixed: boolean}>} */
const towns = {}
const counts = { eversource: 0, nationalgrid: 0, unitil: 0, cape_light: 0, municipalOnly: 0, mixed: 0, other: 0 }
const unresolvedTokens = new Set()
let duplicateKeys = 0

for (const feature of features) {
  const attributes = feature?.attributes ?? {}
  const rawTown = attributes.TOWN
  const label = attributes.ELEC_LABEL ?? attributes.ELEC
  if (typeof rawTown !== 'string' || rawTown.trim() === '') {
    throw new Error(`ElectricityProviders: a feature has no TOWN (row ${JSON.stringify(attributes)})`)
  }
  const display = titleCaseTown(rawTown.trim())
  const key = townKey(display)
  if (towns[display]) duplicateKeys += 1

  const parsed = parseElecLabel(label)
  for (const token of parsed.unresolved) unresolvedTokens.add(token)
  if (parsed.sponsors.length === 0) {
    // Keep the town addressable but with no sponsor: the gate asks rather than guesses.
    console.warn(`  warn   ${display}: no sponsor parsed from ${JSON.stringify(label)}`)
  }

  towns[display] = {
    sponsors: parsed.sponsors,
    hasMunicipal: parsed.hasMunicipal,
    mixed: parsed.mixed,
  }

  if (parsed.mixed) counts.mixed += 1
  if (parsed.sponsors.length === 1 && parsed.sponsors[0] === 'municipal') counts.municipalOnly += 1
  for (const sponsor of parsed.sponsors) {
    if (sponsor === 'eversource') counts.eversource += 1
    else if (sponsor === 'nationalgrid') counts.nationalgrid += 1
    else if (sponsor === 'unitil') counts.unitil += 1
    else if (sponsor === 'cape_light') counts.cape_light += 1
    else if (sponsor === 'other') counts.other += 1
  }
  void key
}

const townCount = Object.keys(towns).length
if (townCount !== EXPECTED_TOWNS) {
  throw new Error(`expected ${EXPECTED_TOWNS} unique town keys, wrote ${townCount} (${duplicateKeys} duplicates)`)
}

const artefact = {
  _meta: meta({
    source: 'MassGIS / Hackachusetts 2026 data portal — Electricity Providers by town',
    url: URL,
    fetchedAt: result.fetchedAt,
    recordCount: townCount,
    extra: {
      fields: 'towns: display name → { sponsors, hasMunicipal, mixed }',
      sponsorKeys: ['eversource', 'nationalgrid', 'unitil', 'cape_light', 'municipal', 'other'],
      mixedMeans: 'more than one sponsor serves the town; ask the user which one bills them',
      caveats: [
        'Cape Light Compact is not a label in this dataset: its member towns appear as Eversource distribution, so cape_light is never emitted from this source.',
        'A town whose label names no known sponsor gets sponsors: [] and the gate asks.',
      ],
      distribution: counts,
    },
  }),
  towns,
}

if (!checkOnly) {
  await writeJson(OUT, artefact)
}

const sizes = await sizesOf(OUT)
const ok = reportSize(relative(process.cwd(), OUT), sizes, BUDGET_BYTES)

const municipalOnly = Object.entries(towns)
  .filter(([, v]) => v.sponsors.length === 1 && v.sponsors[0] === 'municipal')
  .map(([name]) => name)
const mixedTowns = Object.entries(towns)
  .filter(([, v]) => v.mixed)
  .map(([name, v]) => `${name} [${v.sponsors.join('+')}]`)

console.log(`  towns ${townCount} · municipal-only ${municipalOnly.length} · mixed ${mixedTowns.length}`)
console.log(`  sponsors eversource ${counts.eversource} · nationalgrid ${counts.nationalgrid} · unitil ${counts.unitil} · cape_light ${counts.cape_light} · other ${counts.other}`)
console.log(`  mixed ${mixedTowns.join(', ') || 'none'}`)
console.log(`  MLP examples ${municipalOnly.slice(0, 8).join(', ')}`)
console.log(`  artefact ${kb(sizes.raw)} raw (budget ${kb(BUDGET_BYTES)}) ${ok ? 'ok' : 'OVER'}`)
console.log(`  cached ${(await readFile(CACHE, 'utf8')).length.toLocaleString()} bytes at ${resolve(CACHE)}`)
if (!ok) process.exitCode = 1
