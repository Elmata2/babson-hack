/**
 * @built F-61 state geometry trim: simplify + quantise `ma-tracts.topo.json` under budget
 *
 * The budget is an acceptance criterion, not an aspiration: ≤ 2.5 MB raw and
 * < 700 KB brotli for all 1,620 tracts. This script owns that number. It reads the
 * cached TIGERweb download (so a re-run asks the Census Bureau for nothing),
 * rebuilds the topology at the requested tolerance, decodes every ring to prove
 * the file is still valid geometry, and refuses to ship an over-budget artefact.
 *
 * Usage:
 *   node scripts/trim-geo.mjs                    # rebuild at the default tolerance
 *   node scripts/trim-geo.mjs --tolerance=0.0008 # looser, smaller
 *   node scripts/trim-geo.mjs --precision=1e-4   # coarser grid, smaller
 *   node scripts/trim-geo.mjs --check            # sizes of what is on disk, writes nothing
 */

import { cachePath, kb, readCache, reportSize, sizesOf, writeJson } from './lib/http.mjs'
import { buildTractTopology, DEFAULT_SCALE, DEFAULT_TOLERANCE_DEG } from './lib/tract-topology.mjs'

const OUT = 'public/data/ma-tracts.topo.json'
const RAW_BUDGET = 2.5 * 1024 * 1024
const BROTLI_BUDGET = 700 * 1024
const EXPECTED_TRACTS = 1_620

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`))
  return match ? Number(match.split('=')[1]) : fallback
}
const toleranceDeg = flag('tolerance', DEFAULT_TOLERANCE_DEG)
const scale = flag('precision', DEFAULT_SCALE)
const checkOnly = args.includes('--check')

if (checkOnly) {
  const sizes = await sizesOf(OUT)
  const ok = reportSize(OUT, sizes, RAW_BUDGET, { brotliBudget: BROTLI_BUDGET })
  process.exit(ok ? 0 : 1)
}

if (!Number.isFinite(toleranceDeg) || toleranceDeg <= 0) throw new Error('--tolerance must be a positive number of degrees')
if (!Number.isFinite(scale) || scale <= 0) throw new Error('--precision must be a positive number of degrees')

const cached = await readCache(cachePath('tracts.full.geojson.json'))
if (!cached) {
  throw new Error('no cached tract download at .bake-cache/tracts.full.geojson.json — run `node scripts/bake-map.mjs` first')
}
const features = cached.data?.features
if (!Array.isArray(features) || features.length !== EXPECTED_TRACTS) {
  throw new Error(`cached tracts: expected ${EXPECTED_TRACTS} features, got ${features?.length}`)
}

console.log(
  `trim-geo — ${features.length} tracts, tolerance ${toleranceDeg} deg, grid ${scale} deg`,
)

const { artefact, stats } = buildTractTopology(features, {
  source: 'US Census Bureau TIGERweb — Census Tracts 2020, Massachusetts (STATE=25)',
  url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query',
  fetchedAt: cached.fetchedAt,
  scale,
  toleranceDeg,
})

await writeJson(OUT, artefact)
const sizes = await sizesOf(OUT)
const ok = reportSize(OUT, sizes, RAW_BUDGET, { brotliBudget: BROTLI_BUDGET })

console.log(
  `  ${stats.shapes} shapes · ${stats.arcs} arcs · ${stats.vertices}/${stats.sourceVertices} vertices kept ` +
    `(${(stats.retainedShare * 100).toFixed(1)}%) · ${stats.junctions} junctions · ${stats.sharedArcReferences}/${stats.arcReferences} arc references shared`,
)
console.log(`  decoded and verified: every shape present, every ring closed`)
console.log(`  ${ok ? 'inside budget' : `OVER BUDGET — drop precision or raise tolerance`} (${kb(sizes.raw)} raw, ${kb(sizes.brotli)} brotli)`)
if (!ok) process.exitCode = 1
