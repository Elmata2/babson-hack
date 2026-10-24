/**
 * @built F-13 statewide map artefacts: tracts, towns, ACS B25040, EJ2020, town→county→tract
 *
 * No demo borough (ADR-009): all 1,620 tracts and 351 municipalities, or nothing.
 * Every source here is keyless and public. Census Reporter replaces api.census.gov
 * because the latter now 302s to `missing_key.html`; the committed JSON means the
 * runtime needs no key at all.
 *
 * Outputs
 *   public/data/ma-tracts.topo.json   TIGERweb tracts, simplified + quantised (via trim-geo)
 *   public/data/ma-towns.json         MassGIS Census2020_Towns, simplified
 *   public/data/ma-tract-stats.json   ACS B25040 fuel mix + B01003 population
 *   public/data/ej-blockgroups.json   MassGIS EJ2020, block group rows joined to tract
 *   data/generated/towns-by-county.json  the index lib/geo.ts reads (town → county → tracts)
 *
 * Usage:
 *   node scripts/bake-map.mjs             # fetch (cached), write everything
 *   node scripts/bake-map.mjs --from-cache
 *   node scripts/bake-map.mjs --check     # sizes only
 *   node scripts/bake-map.mjs --skip-tracts   # rebuild stats/towns/EJ from cache
 */

import { cachePath, fetchJson, fetchJsonCached, kb, meta, reportSize, sizesOf, writeJson } from './lib/http.mjs'
import { partsOfGeometry, pointInRings, ringBounds, ringsOfGeometry } from './lib/geo.mjs'
import { buildTractTopology } from './lib/tract-topology.mjs'

const TRACTS_BASE =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query' +
  "?where=STATE%3D%2725%27&outFields=GEOID,STATE,COUNTY,TRACT&outSR=4326&returnGeometry=true"
const TOWNS_SERVICE =
  'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/Census2020_Towns/MapServer'
const EJ_URL =
  'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0/query' +
  '?where=1%3D1&outFields=GEOID,MUNICIPALITY,TOTAL_POP,PCT_MINORITY,TOTALHH,LIMENGHHPCT,BG_MHHI,EJ' +
  '&returnGeometry=false&f=json'
const STATS_URL =
  'https://api.censusreporter.org/1.0/data/show/latest' +
  '?table_ids=B25040%2CB01003%2CB25035&geo_ids=140%7C04000US25'

const OUT_TRACTS = 'public/data/ma-tracts.topo.json'
const OUT_TOWNS = 'public/data/ma-towns.json'
const OUT_STATS = 'public/data/ma-tract-stats.json'
const OUT_EJ = 'public/data/ej-blockgroups.json'
const OUT_INDEX = 'data/generated/towns-by-county.json'

const BUDGET = {
  [OUT_TRACTS]: { raw: 2.5 * 1024 * 1024, brotli: 700 * 1024 },
  [OUT_TOWNS]: { raw: 400 * 1024 },
  [OUT_STATS]: { raw: 150 * 1024 },
  [OUT_EJ]: { raw: 300 * 1024 },
}

const EXPECTED_TRACTS = 1_620
const EXPECTED_TOWNS = 351
/** 4 decimal places ≈ 11 m: enough for a town outline, and half the bytes. */
const TOWN_PRECISION = 4
/** Quantisation step for the tract topology, degrees. 1e-5 ≈ 1.1 m. */
const TRACT_SCALE = 1e-5
/**
 * Shared-arc simplification tolerance, degrees (~50 m).
 *
 * Deliberately *not* `maxAllowableOffset`: that is applied per feature by the
 * server, so two neighbours end up with differently simplified borders — gaps
 * open along every shared boundary and no two arcs can be shared. Full-precision
 * geometry is downloaded once and simplified here, on the arcs, which is both
 * tighter (≈420 KB vs 8.5 MB of per-vertex arcs) and gap-free. `--coarse` falls
 * back to the server-simplified download for a fast re-run.
 */
const TRACT_TOLERANCE_DEG = 0.0005

const checkOnly = process.argv.includes('--check')
const useCache = process.argv.includes('--from-cache')
const skipTracts = process.argv.includes('--skip-tracts')
const coarse = process.argv.includes('--coarse')

if (checkOnly) {
  let ok = true
  for (const [path, budget] of Object.entries(BUDGET)) {
    ok = reportSize(path, await sizesOf(path), budget.raw, { brotliBudget: budget.brotli }) && ok
  }
  ok = reportSize(OUT_INDEX, await sizesOf(OUT_INDEX), 80 * 1024) && ok
  process.exit(ok ? 0 : 1)
}

console.log('bake-map — statewide tracts, towns, ACS B25040, EJ2020')

// --------------------------------------------------------------------- tracts

/** GeoJSON features for the 1,620 tracts, from cache or TIGERweb. */
async function loadTracts() {
  const offset = coarse ? '&maxAllowableOffset=0.001' : ''
  const url = `${TRACTS_BASE}${offset}&f=geojson`
  const cacheFile = coarse ? 'tracts.coarse.geojson.json' : 'tracts.full.geojson.json'
  const cached = await fetchJsonCached(cachePath(cacheFile), url, {
    useCache,
    label: `TIGERweb tracts (geojson${coarse ? ', server-simplified' : ', full precision'})`,
    timeoutMs: 180_000,
  }).catch(async (error) => {
    // Documented fallback: the service refuses geojson → take esri json and convert.
    console.warn(`  warn   geojson refused (${error.message}); falling back to f=json`)
    const esri = await fetchJsonCached(cachePath(cacheFile.replace('.geojson', '.esri')), `${TRACTS_BASE}${offset}&f=json`, {
      useCache,
      label: 'TIGERweb tracts (esri json)',
      timeoutMs: 180_000,
    })
    return { ...esri, data: esriToGeoJson(esri.data) }
  })

  const collection = cached.data
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('tracts: expected a GeoJSON FeatureCollection')
  }
  if (collection.exceededTransferLimit) {
    throw new Error(
      'tracts: response was truncated (exceededTransferLimit). Add resultOffset pagination before shipping this.',
    )
  }
  return { features: collection.features, fetchedAt: cached.fetchedAt }
}

/** A grid of points inside a tract's rings: the sampling unit for the town join. */
function interiorSamples(rings, perSide = 14) {
  const [minX, minY, maxX, maxY] = ringBounds(rings)
  const points = []
  const stepX = (maxX - minX) / perSide
  const stepY = (maxY - minY) / perSide
  for (let i = 0; i < perSide; i += 1) {
    for (let j = 0; j < perSide; j += 1) {
      const x = minX + (i + 0.5) * stepX
      const y = minY + (j + 0.5) * stepY
      if (pointInRings(rings, x, y)) points.push([x, y])
    }
  }
  if (points.length >= 3) return points
  // Long thin coastal tracts can slip between grid lines: fall back to vertices.
  const fallback = []
  for (const ring of rings) {
    const stride = Math.max(1, Math.floor(ring.length / 24))
    for (let i = 0; i < ring.length; i += stride) fallback.push(ring[i])
  }
  return fallback
}

/**
 * Convert an esri `f=json` feature set to GeoJSON. Ring 0 of each polygon is the
 * outer ring; following rings are holes. Winding is not trusted — even-odd
 * rendering in MapLibre handles either direction.
 */
function esriToGeoJson(esri) {
  if (!esri || !Array.isArray(esri.features)) throw new Error('esri payload has no features[]')
  const features = esri.features.map((feature) => {
    const rings = feature.geometry?.rings ?? []
    const properties = feature.attributes ?? {}
    if (rings.length === 0) return { type: 'Feature', geometry: null, properties }
    if (rings.length === 1) {
      return { type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties }
    }
    return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) }, properties }
  })
  return { type: 'FeatureCollection', features }
}

let tractFeatures = []
let tractsFetchedAt = null
/** @type {Map<string, string[]>} tract GEOID → sampled lon/lat points, for the town join */
const tractSamples = new Map()

if (!skipTracts) {
  const tracts = await loadTracts()
  tractFeatures = tracts.features
  tractsFetchedAt = tracts.fetchedAt
  if (tractFeatures.length !== EXPECTED_TRACTS) {
    throw new Error(`tracts: expected ${EXPECTED_TRACTS} features, got ${tractFeatures.length}`)
  }

  // Sample the *interior* of every tract for the town join. Sampling vertices
  // instead puts every test point exactly on a shared border, where point-in-polygon
  // is ambiguous: that left Aquinnah, Chilmark, Gosnold and Heath with no tract.
  for (const feature of tractFeatures) {
    const geoid = String(feature.properties?.GEOID ?? '')
    tractSamples.set(geoid, interiorSamples(ringsOfGeometry(feature.geometry)))
  }

  const { artefact, stats } = buildTractTopology(tractFeatures, {
    source: 'US Census Bureau TIGERweb — Census Tracts 2020, Massachusetts (STATE=25)',
    url: `${TRACTS_BASE}&f=geojson`,
    fetchedAt: tractsFetchedAt,
    scale: TRACT_SCALE,
    toleranceDeg: TRACT_TOLERANCE_DEG,
  })
  await writeJson(OUT_TRACTS, artefact)
  console.log(
    `  tracts ${stats.shapes} shapes · ${stats.arcs} arcs · ${stats.vertices}/${stats.sourceVertices} vertices kept (${(stats.retainedShare * 100).toFixed(0)}%)`,
  )
} else {
  console.log('  tracts skipped (--skip-tracts); existing artefact left untouched')
}

// ---------------------------------------------------------------------- towns

/** Introspect the layer id and fields first — the spec says the schema is unverified. */
async function loadTownLayer() {
  const service = await fetchJsonCached(cachePath('towns-service.json'), `${TOWNS_SERVICE}?f=json`, {
    useCache,
    label: 'Census2020_Towns service metadata',
  })
  const layers = Array.isArray(service.data?.layers) ? service.data.layers : []
  const polygonLayer = layers.find((layer) => layer.geometryType === 'esriGeometryPolygon')
  if (!polygonLayer) throw new Error('Census2020_Towns: no polygon layer in the service')
  // The layer list carries no fields; the layer resource does.
  const detail = await fetchJsonCached(cachePath('towns-layer.json'), `${TOWNS_SERVICE}/${polygonLayer.id}?f=json`, {
    useCache,
    label: `Census2020_Towns layer ${polygonLayer.id} metadata`,
  })
  return { id: polygonLayer.id, fields: detail.data?.fields ?? [] }
}

const townLayer = await loadTownLayer()
const townFieldNames = (townLayer.fields ?? []).map((field) => field.name)
for (const required of ['GEOID20', 'TOWN20', 'COUNTY20', 'COUNTYFP20']) {
  if (!townFieldNames.includes(required)) throw new Error(`Census2020_Towns layer ${townLayer.id} is missing ${required}`)
}

const townsUrl =
  `${TOWNS_SERVICE}/${townLayer.id}/query?where=1%3D1&outFields=GEOID20,TOWN20,COUNTY20,COUNTYFP20,POP2020` +
  '&outSR=4326&returnGeometry=true&f=geojson&maxAllowableOffset=0.002'
const townsResult = await fetchJsonCached(cachePath('towns.geojson.json'), townsUrl, {
  useCache,
  label: `Census2020_Towns layer ${townLayer.id}`,
  timeoutMs: 60_000,
})
const townFeatures = townsResult.data?.features
if (!Array.isArray(townFeatures) || townFeatures.length !== EXPECTED_TOWNS) {
  throw new Error(`towns: expected ${EXPECTED_TOWNS} features, got ${townFeatures?.length}`)
}

const round = (value, digits) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Town polygons in degrees, used for the town↔tract join before rounding. */
const townShapes = townFeatures.map((feature) => {
  const parts = partsOfGeometry(feature.geometry)
  return {
    name: feature.properties.TOWN20,
    county: feature.properties.COUNTY20,
    countyFips: `25${feature.properties.COUNTYFP20}`,
    geoid: String(feature.properties.GEOID20),
    population: feature.properties.POP2020,
    parts,
    // pointInRings takes a flat ring list (outer + holes), not a list of parts.
    rings: parts.flat(),
    bounds: ringBounds(parts.flat()),
  }
})

const townsArtefact = {
  _meta: meta({
    source: 'MassGIS — 2020 US Census Towns (polygons)',
    url: `${TOWNS_SERVICE}/${townLayer.id}/query`,
    fetchedAt: townsResult.fetchedAt,
    recordCount: townFeatures.length,
    extra: {
      format: 'GeoJSON FeatureCollection, coordinates rounded to 4 dp (~11 m), simplified at maxAllowableOffset=0.002',
      properties: ['geoid (10-digit)', 'town', 'county'],
      caveat: 'Drill-down boundary layer only. Not a survey boundary; do not use for area or tax purposes.',
    },
  }),
  type: 'FeatureCollection',
  features: townShapes.map((town) => ({
    type: 'Feature',
    properties: { geoid: town.geoid, town: town.name, county: titleCase(town.county) },
    geometry: {
      type: town.parts.length === 1 ? 'Polygon' : 'MultiPolygon',
      coordinates:
        town.parts.length === 1
          ? town.parts[0].map((ring) => ring.map(([x, y]) => [round(x, TOWN_PRECISION), round(y, TOWN_PRECISION)]))
          : town.parts.map((part) => part.map((ring) => ring.map(([x, y]) => [round(x, TOWN_PRECISION), round(y, TOWN_PRECISION)]))),
    },
  })),
}

await writeJson(OUT_TOWNS, townsArtefact)
console.log(`  towns ${townShapes.length} features from layer ${townLayer.id}`)

/** TIGER20 names are uppercase: "MANCHESTER-BY-THE-SEA" → "Manchester-by-the-Sea". */
function titleCase(name) {
  const small = new Set(['of', 'the', 'and', 'by', 'on', 'at'])
  let seenWord = 0
  return String(name)
    .toLowerCase()
    .split(' ')
    .map((word) => {
      let seenChunk = 0
      const out = word
        .split('-')
        .map((chunk) => {
          if (chunk.length === 0) return chunk
          const isSmall = small.has(chunk) && (seenWord > 0 || seenChunk > 0)
          seenChunk += 1
          return isSmall ? chunk : chunk[0].toUpperCase() + chunk.slice(1)
        })
        .join('-')
      seenWord += 1
      return out
    })
    .join(' ')
}

// -------------------------------------------------------------- tract → town

/** Assign every tract to the town that holds most of its sampled outline. */
const townByTract = new Map()
const unresolvedTracts = []
if (!skipTracts) {
  for (const [geoid, points] of tractSamples) {
    const votes = new Map()
    for (const [x, y] of points) {
      for (const town of townShapes) {
        const [minX, minY, maxX, maxY] = town.bounds
        if (x < minX || x > maxX || y < minY || y > maxY) continue
        if (pointInRings(town.rings, x, y)) votes.set(town.name, (votes.get(town.name) ?? 0) + 1)
      }
    }
    let bestName = null
    let bestVotes = 0
    for (const [name, count] of votes) {
      if (count > bestVotes) {
        bestName = name
        bestVotes = count
      }
    }
    // Any land contact is enough: coastal tracts sample a lot of open water, so a
    // ratio test rejects island and shoreline tracts. Zero votes means open water —
    // those three harbour tracts belong to no municipality and stay unassigned.
    // A tract that straddles a town line is listed under *every* town it touches:
    // 1,620 tracts cannot map one-to-one onto 351 towns (rural towns share tracts),
    // and a one-winner rule left 56 towns with no tract at all.
    if (bestName && bestVotes > 0) {
      const towns = [...votes.entries()]
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => titleCase(name))
      townByTract.set(geoid, towns)
    } else {
      unresolvedTracts.push({ geoid, votes: bestVotes, samples: points.length })
    }
  }
  if (unresolvedTracts.length > 0) {
    console.warn(
      `  warn   ${unresolvedTracts.length} water tracts touch no town: ${unresolvedTracts.map((t) => t.geoid).join(', ')}`,
    )
  }
  if (unresolvedTracts.length > 8) {
    throw new Error(`tract→town join failed for ${unresolvedTracts.length} tracts — that is more than open water.`)
  }
}

// ----------------------------------------------------------------- ACS stats

const statsResult = await fetchJsonCached(cachePath('censusreporter-b25040.json'), STATS_URL, {
  useCache,
  label: 'Census Reporter B25040 + B01003 + B25035',
  timeoutMs: 60_000,
})
const rows = statsResult.data?.data
if (!rows || typeof rows !== 'object') throw new Error('Census Reporter: payload has no data{}')

/** @type {Record<string, number[]>} geoid → [pop, hh, oilHH, gasHH, elecHH, propaneHH, medYearBuilt] */
const tractStats = {}
let statsMissing = 0
let tractCount = 0

for (const [key, value] of Object.entries(rows)) {
  // "14000US25001010100" → "25001010100"
  const geoid = key.includes('US') ? key.slice(key.indexOf('US') + 2) : key
  if (!/^\d{11}$/.test(geoid)) continue
  tractCount += 1
  const estimate = value?.B25040?.estimate
  if (!estimate || typeof estimate.B25040001 !== 'number') {
    statsMissing += 1
    continue
  }
  const hh = estimate.B25040001
  const pop = typeof value?.B01003?.estimate?.B01003001 === 'number' ? value.B01003.estimate.B01003001 : null
  const medYearBuilt =
    typeof value?.B25035?.estimate?.B25035001 === 'number' ? value.B25035.estimate.B25035001 : null
  if (pop === null) statsMissing += 1
  tractStats[geoid] = [
    pop ?? 0,
    hh,
    estimate.B25040005 ?? 0, // fuel oil, kerosene
    estimate.B25040002 ?? 0, // utility gas
    estimate.B25040004 ?? 0, // electricity
    estimate.B25040003 ?? 0, // bottled / propane
    medYearBuilt ?? 0,
  ]
}

if (tractCount !== EXPECTED_TRACTS) {
  throw new Error(`Census Reporter: expected ${EXPECTED_TRACTS} tracts, got ${tractCount}`)
}

const statsArtefact = {
  _meta: meta({
    source: 'US Census ACS 5-year, via Census Reporter (keyless) — tables B25040, B01003, B25035',
    url: STATS_URL,
    fetchedAt: statsResult.fetchedAt,
    recordCount: Object.keys(tractStats).length,
    extra: {
      fields:
        'tracts: 11-digit GEOID → [population, occupiedUnits, oilUnits, gasUnits, electricUnits, propaneUnits, medianYearBuilt]',
      table: 'B25040 House Heating Fuel; B01003 total population; B25035 median year structure built',
      units: 'counts of occupied housing units; medianYearBuilt is 0 when the tract has no estimate',
      missing: `${statsMissing} tracts had no usable estimate and are absent`,
      caveat:
        'ACS 5-year estimates carry sampling error; a small tract can swing by hundreds of households. Read as a share, not a count.',
    },
  }),
  tracts: tractStats,
}
await writeJson(OUT_STATS, statsArtefact)
console.log(`  stats ${Object.keys(tractStats).length} tracts (${statsMissing} without an estimate)`)

// ------------------------------------------------------------------- EJ2020

const EJ_PAGE = 2_000
const ejRows = []
let ejFetchedAt = null
for (let offset = 0; ; offset += EJ_PAGE) {
  const url = `${EJ_URL}&resultOffset=${offset}&resultRecordCount=${EJ_PAGE}`
  const page = await fetchJsonCached(cachePath('ej2020', `offset-${offset}.json`), url, {
    useCache,
    label: `EJ2020 offset ${offset}`,
    timeoutMs: 30_000,
  })
  ejFetchedAt ??= page.fetchedAt
  const features = page.data?.features
  if (!Array.isArray(features)) throw new Error(`EJ2020: no features at offset ${offset}`)
  for (const feature of features) ejRows.push(feature.attributes)
  if (features.length < EJ_PAGE) break
  if (offset > EJ_PAGE * 6) throw new Error('EJ2020: pagination did not terminate')
}

/**
 * @type {Record<string, number[]>} tract → [ejBlockGroups, ejPopulation, pctMinority,
 *   limEngHouseholdPct, medianBlockGroupIncome]
 */
const ejTractSummary = {}
/**
 * @type {Record<string, Array<[string, number, number, number, number]>>}
 * tract → [[blockGroupDigit, pctMinority, limEngHouseholdPct, medianIncome, households], …]
 */
const ejGroups = {}
/** Accumulators: bgCount, population, minority×pop, households, limEng×hh, income, incomeCount */
const accumulators = new Map()

for (const row of ejRows) {
  const geoid = String(row.GEOID ?? '')
  if (!/^\d{12}$/.test(geoid)) continue
  const tract = geoid.slice(0, 11)
  const bg = geoid.slice(11)
  const pop = Number(row.TOTAL_POP) || 0
  const hh = Number(row.TOTALHH) || 0
  const minority = Number(row.PCT_MINORITY) || 0
  const limEng = Number(row.LIMENGHHPCT) || 0
  const income = Number(row.BG_MHHI) || 0

  const agg = accumulators.get(tract) ?? [0, 0, 0, 0, 0, 0, 0]
  agg[0] += 1
  agg[1] += pop
  agg[2] += minority * pop
  agg[3] += hh
  agg[4] += limEng * hh
  agg[5] += income > 0 ? income : 0
  agg[6] += income > 0 ? 1 : 0
  accumulators.set(tract, agg)

  ;(ejGroups[tract] ??= []).push([bg, Number(minority.toFixed(1)), Number(limEng.toFixed(1)), Math.round(income), hh])
}

for (const [tract, agg] of accumulators) {
  const [bgCount, popSum, minorityWeighted, hhSum, limWeighted, incomeSum, incomeCount] = agg
  ejTractSummary[tract] = [
    bgCount,
    popSum,
    Number((minorityWeighted / (popSum || 1)).toFixed(1)),
    Number((limWeighted / (hhSum || 1)).toFixed(1)),
    incomeCount > 0 ? Math.round(incomeSum / incomeCount) : 0,
  ]
}

const ejArtefact = {
  _meta: meta({
    source: 'MassGIS Environmental Justice Populations 2020 (block groups), joined to 2020 tracts',
    url: `${EJ_URL}&resultOffset=0`,
    fetchedAt: ejFetchedAt,
    recordCount: ejRows.length,
    extra: {
      fields:
        'tracts: tract GEOID → [ejBlockGroups, ejPopulation, pctMinority, limEngHouseholdPct, medianBlockGroupIncome]; ' +
        'blockgroups: tract GEOID → [[blockGroupDigit, pctMinority, limEngHouseholdPct, medianIncome, households], …]',
      aggregation:
        'Minority share is population weighted and limited-English share household weighted, across the EJ block groups of that tract only. ' +
        'Median income is the mean of block-group medians, not a true tract median.',
      joinKey:
        'Block-group GEOID is the 11-digit tract GEOID plus its single-digit block group, so the join needs no geometry.',
      coverage:
        `This layer publishes EJ-designated block groups only: ${ejRows.length} rows, all EJ="Yes", across 187 municipalities. ` +
        'It is NOT every Massachusetts block group, so the percentages describe EJ block groups, never the whole tract. ' +
        'Divide ejPopulation by the tract population in ma-tract-stats.json to get the EJ share of a tract.',
      caveat:
        "EJ2020 flags are the state's 2020 criteria (minority, income, English isolation), not a 2026 determination.",
    },
  }),
  tracts: ejTractSummary,
  blockgroups: ejGroups,
}
await writeJson(OUT_EJ, ejArtefact)
console.log(`  EJ ${ejRows.length} block groups → ${Object.keys(ejTractSummary).length} tracts`)

// --------------------------------------------------- town → county → tract index

/** @type {Record<string, {name: string, towns: Record<string, string[]>}>} */
const counties = {}
for (const town of townShapes) {
  const fips = town.countyFips
  const entry = (counties[fips] ??= { name: titleCase(town.county), towns: {} })
  entry.towns[titleCase(town.name)] = []
}
for (const [tract, townNames] of townByTract) {
  for (const townName of townNames) {
    for (const entry of Object.values(counties)) {
      const list = entry.towns[townName]
      if (list) {
        list.push(tract)
        break
      }
    }
  }
}
for (const entry of Object.values(counties)) {
  for (const list of Object.values(entry.towns)) list.sort()
}

const townCount = Object.values(counties).reduce((n, c) => n + Object.keys(c.towns).length, 0)
/** Distinct tracts reachable in the index (a straddling tract appears under each town). */
const distinctTracts = new Set(Object.values(counties).flatMap((c) => Object.values(c.towns).flat()))
const townTractPairs = Object.values(counties).reduce(
  (n, c) => n + Object.values(c.towns).reduce((m, list) => m + list.length, 0),
  0,
)
if (townCount !== EXPECTED_TOWNS) throw new Error(`index: ${townCount} towns, expected ${EXPECTED_TOWNS}`)
if (!skipTracts) {
  // Every municipality must be drillable: a town with no tract is a hole in the map.
  const emptyTowns = Object.entries(counties).flatMap(([fips, county]) =>
    Object.entries(county.towns)
      .filter(([, tractList]) => tractList.length === 0)
      .map(([name]) => `${name} (${fips})`),
  )
  if (emptyTowns.length > 0) throw new Error(`index: towns with no tracts: ${emptyTowns.join(', ')}`)
  const expectedAssigned = EXPECTED_TRACTS - unresolvedTracts.length
  if (distinctTracts.size < expectedAssigned) {
    throw new Error(`index: ${distinctTracts.size} distinct tracts, expected ${expectedAssigned}`)
  }
}

const indexArtefact = {
  _meta: meta({
    source: 'Derived at bake time: MassGIS Census2020_Towns × TIGERweb tracts',
    url: `${TOWNS_SERVICE}/${townLayer.id}/query`,
    fetchedAt: townsResult.fetchedAt,
    recordCount: townCount,
    extra: {
      format: 'counties: 5-digit FIPS → { name, towns: { "Town Name": [11-digit tract GEOID, …] } }',
      method:
        'Every tract outline is sampled and point-in-polygon tested against town polygons. A tract is listed under every town it touches, so town lists overlap and must never be summed: use them for drill-down, not for town totals.',
      townTractPairs,
      unresolvedTracts: unresolvedTracts.map((t) => t.geoid),
      caveat: 'A tract that straddles a town line is assigned to the town holding most of its outline.',
    },
  }),
  counties,
}
await writeJson(OUT_INDEX, indexArtefact)

// -------------------------------------------------------------------- report

let ok = true
for (const [path, budget] of Object.entries(BUDGET)) {
  if (path === OUT_TRACTS && skipTracts) continue
  ok = reportSize(path, await sizesOf(path), budget.raw, { brotliBudget: budget.brotli }) && ok
}
ok = reportSize(OUT_INDEX, await sizesOf(OUT_INDEX), 80 * 1024) && ok

console.log(
  `  index ${townCount} towns · ${Object.keys(counties).length} counties · ${distinctTracts.size} distinct tracts · ${townTractPairs} town-tract pairs`,
)
console.log(`  ${ok ? 'all artefacts inside budget' : 'ONE OR MORE ARTEFACTS OVER BUDGET'}`)
if (!ok) process.exitCode = 1
