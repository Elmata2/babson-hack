/**
 * @built F-43 the Heat lens's three metrics, computed from ACS B25040 and the dated DOER price
 * @built F-45 the 2026 → 2027 cliff, derived from the R5 rebate tables, never retyped
 * @built F-46 "use this tract": a link that seeds the calculator with this tract's numbers
 * @built F-47 the accessible table's rows and the keyboard reducer behind arrow navigation
 * @built F-48 county-level figures that are true before a byte of geometry arrives
 *
 * One model of the money on this map. Every figure the Heat lens draws, prints in a
 * tooltip, or exposes to a screen reader comes from here, so a legend, a tooltip and
 * a table cell cannot disagree.
 *
 * Program numbers are imported, never typed: the whole-home cap for 2026 and 2027 is
 * read from `data/rules/heat-pump-{2026,2027}.json` through `lib/calc/rules`, and the
 * oil price is the DOER snapshot's `oil.avg` with its as-of date attached. The only
 * literal in this file that a household should question is the 750 gal/household
 * assumption (design §3), and it is exported as copy so it rides on every surface
 * that shows a spend figure.
 *
 * Pure: one committed ACS artefact and two committed rule tables. No clock, no
 * network, no DOM.
 */

import { FUEL_SNAPSHOT_2026_10_19, HEAT_PUMP_RULES_2026, HEAT_PUMP_RULES_2027 } from '@/lib/calc/rules'
import { TOWNS, counties, tractsOfTown } from '@/lib/geo'
import statsJson from '../../public/data/ma-tract-stats.json'

// ------------------------------------------------------------------- assumptions

/** Heating oil a Massachusetts household burns in a year. Design §3: an assumption, said out loud. */
export const GAL_PER_HOUSEHOLD = 750

/** The exact words every surface uses. One string, so the tooltip cannot soften it. */
export const ASSUMPTION_NOTE = `assumes ${GAL_PER_HOUSEHOLD} gal/household`

/** Design §3's table shows "$6.23"; this reads the same DOER survey value rather than restating it. */
export const OIL_PRICE_USD_PER_GAL = FUEL_SNAPSHOT_2026_10_19.oil.avg

/** The week the DOER survey describes. Every spend figure carries it. */
export const OIL_PRICE_AS_OF = FUEL_SNAPSHOT_2026_10_19.asOf

// ------------------------------------------------------------------------- cliff

const CAP_2026 = HEAT_PUMP_RULES_2026.tiers.whole.capAfterBonusesUsd
const CAP_2027 = HEAT_PUMP_RULES_2027.tiers.whole.capAfterBonusesUsd

/**
 * What one household loses by installing in 2027 instead of 2026.
 *
 * R5.1/R5.5: the whole-home cap falls from $8,500 to $7,500 on Jan 1, so the delta
 * is $1,000 — but the number lives in `data/rules/`, and this module only subtracts.
 * A table edit that changes the step-down changes the map, the headline and the
 * tract panel on the next build, with no second number to keep in sync.
 */
export const CLIFF_USD_PER_HOME = CAP_2026 - CAP_2027

/** The two caps, for the sentence that explains where the delta came from. */
export const CLIFF_CAPS = { 2026: CAP_2026, 2027: CAP_2027 } as const

/** The most a home loses by installing in 2027 instead of 2026, and why smaller systems lose less. */
export const CLIFF_NOTE = `Up to ${money(CAP_2026 - CAP_2027)} per oil-heated home: the 2026 cap minus the 2027 cap. Smaller systems lose less.`

/** The toggle's helper line; both caps come from the rule tables. */
export const YEAR_TOGGLE_NOTE = `The rebate cap drops from ${money(CAP_2026)} to ${money(CAP_2027)} on 1 January 2027 — this shows what oil-heated homes would lose by waiting.`

/** Provenance for the cliff, rendered next to the dollars. */
export const CLIFF_SOURCE = `Mass Save whole-home cap ${money(CAP_2026)} → ${money(CAP_2027)} on Jan 1 · read ${HEAT_PUMP_RULES_2026.source.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '2026'}`

if (!(CLIFF_USD_PER_HOME > 0)) {
  throw new Error('heat.ts: the 2027 whole-home cap must be below the 2026 cap, or there is no cliff to show')
}

// ------------------------------------------------------------------------ metrics

/**
 * What the choropleth can draw. `oil_share` and `oil_spend` describe the household
 * now; `cliff_homes` and `cliff_dollars` are what the Jan 1 step-down costs it.
 */
export type HeatMetric = 'oil_share' | 'oil_spend' | 'cliff_homes' | 'cliff_dollars'

/** The install year the toggle selects. */
export type HeatYear = 2026 | 2027

/** The four the switcher offers: design §3's three, plus the cliff cohort in homes (R10.2). */
export const HEAT_METRICS: readonly HeatMetric[] = ['oil_share', 'oil_spend', 'cliff_homes', 'cliff_dollars']

export const HEAT_METRIC_LABEL: Record<HeatMetric, string> = {
  oil_share: 'Oil share',
  oil_spend: 'Oil spend',
  cliff_homes: 'Homes on the cliff',
  cliff_dollars: 'Most you could lose',
}

/** One line under the switcher, so the metric is not a mystery. */
export const HEAT_METRIC_HINT: Record<HeatMetric, string> = {
  oil_share: 'Share of occupied homes that heat with oil. ACS B25040.',
  oil_spend: `Dollars leaving the neighbourhood on heating oil at the week-of-${OIL_PRICE_AS_OF} DOER price.`,
  cliff_homes: 'Oil-heated households that lose up to $1,000 each if they install in 2027 instead of 2026.',
  cliff_dollars: 'The same households, in dollars: the most they lose together if they wait until 2027.',
}

/** Class breaks per metric. Four breaks make the five-step ramp in `palette.ts`. */
const BREAKS: Record<HeatMetric, readonly [number, number, number, number]> = {
  // Design §3's original oil-share breaks, kept as the reference distribution.
  oil_share: [0.05, 0.15, 0.3, 0.5],
  // Quintiles of the committed tract table: $300k / $1M / $2M / $3.5M.
  oil_spend: [300_000, 1_000_000, 2_000_000, 3_500_000],
  // Quintiles of oil households: 50 / 200 / 400 / 700 homes.
  cliff_homes: [50, 200, 400, 700],
  // The same cohort in dollars: $100k / $250k / $500k / $1M.
  cliff_dollars: [100_000, 250_000, 500_000, 1_000_000],
}

const LABELS: Record<HeatMetric, readonly [string, string, string, string, string]> = {
  oil_share: ['Under 5%', '5 to 15%', '15 to 30%', '30 to 50%', '50% or more'],
  oil_spend: ['Under $300k', '$300k to $1M', '$1M to $2M', '$2M to $3.5M', '$3.5M or more'],
  cliff_homes: ['Under 50', '50 to 199', '200 to 399', '400 to 699', '700 or more'],
  cliff_dollars: ['Under $100k', '$100k to $250k', '$250k to $500k', '$500k to $1M', '$1M or more'],
}

// --------------------------------------------------------------------------- rows

/** One tract's heating-fuel numbers, all of them derived from the same four counts. */
export interface HeatRow {
  geoid: string
  /** Occupied housing units: the B25040 denominator. */
  households: number
  oilHouseholds: number
  /** 0–1, or null when the tract has nobody in it. */
  oilShare: number | null
  /** Annual dollars spent on heating oil by this tract's oil-heated homes. */
  oilSpendUsd: number
  /** Households that lose the step-down if they install after Jan 1. */
  cliffHomes: number
  /** `cliffHomes × CLIFF_USD_PER_HOME`. */
  cliffDollars: number
  medianYearBuilt: number
}

/** A tract with no occupied households has no share, no spend and no cliff: it is drawn grey. */
export function heatRow(input: {
  geoid: string
  households: number
  oilHouseholds: number
  medianYearBuilt?: number
}): HeatRow | null {
  if (!Number.isFinite(input.households) || input.households < 0) return null
  const oil = Math.max(0, Math.min(input.oilHouseholds, input.households))
  const crowded = input.households === 0
  return {
    geoid: input.geoid,
    households: input.households,
    oilHouseholds: oil,
    oilShare: crowded ? null : oil / input.households,
    oilSpendUsd: oil * GAL_PER_HOUSEHOLD * OIL_PRICE_USD_PER_GAL,
    cliffHomes: oil,
    cliffDollars: oil * CLIFF_USD_PER_HOME,
    medianYearBuilt: input.medianYearBuilt ?? 0,
  }
}

/**
 * The metric's value for one tract in one year, or null where the map draws grey.
 *
 * In 2026 nothing has been lost yet — the cliff is a 2027 fact — so both cliff
 * metrics are exactly zero before the toggle moves. That is the animation: a pale
 * state that fills in with money when the year changes.
 */
export function metricValue(row: HeatRow, metric: HeatMetric, year: HeatYear): number | null {
  if (row.households === 0 || row.oilShare === null) return null
  switch (metric) {
    case 'oil_share':
      return row.oilShare
    case 'oil_spend':
      return row.oilSpendUsd
    case 'cliff_homes':
      return year === 2027 ? row.cliffHomes : 0
    case 'cliff_dollars':
      return year === 2027 ? row.cliffDollars : 0
  }
}

/** Names of the GeoJSON properties `map-data.ts` stamps and `layers.ts` paints from. */
export function heatProperty(metric: HeatMetric, year: HeatYear): string {
  switch (metric) {
    case 'oil_share':
      return 'oilShare'
    case 'oil_spend':
      return 'oilSpend'
    case 'cliff_homes':
      return year === 2027 ? 'cliffHomes2027' : 'cliffHomes2026'
    case 'cliff_dollars':
      return year === 2027 ? 'cliffDollars2027' : 'cliffDollars2026'
  }
}

/** How the choropleth draws one metric in one year: property, breaks, labels, one-line note. */
export interface HeatScale {
  property: string
  breaks: readonly [number, number, number, number]
  labels: readonly [string, string, string, string, string]
  /** What the colours mean this year. Printed under the ramp. */
  note: string
}

const HOMES_BREAKS = BREAKS.cliff_homes
const HOMES_LABELS: readonly [string, string, string, string, string] = [
  'Under 50 homes',
  '50 to 199 homes',
  '200 to 399 homes',
  '400 to 699 homes',
  '700 or more homes',
]

/**
 * The layer and the legend read this function, so they cannot drift.
 *
 * One deliberate difference from `metricValue`: in 2026 the cliff layer paints the
 * *cohort* it would cost money — homes exposed — because the dollars lost before
 * Jan 1 are exactly zero and an all-cream state tells nobody anything. 2027 paints
 * the dollars those same homes lose. The panel, the table and the headline always
 * use `metricValue`, which is $0 in 2026 and never pretends otherwise.
 */
export function heatScale(metric: HeatMetric, year: HeatYear): HeatScale {
  if (metric === 'cliff_dollars') {
    return year === 2027
      ? {
          property: 'cliffDollars2027',
          breaks: BREAKS.cliff_dollars,
          labels: LABELS.cliff_dollars,
          note: 'Up to this much lost on Jan 1 if these homes wait until 2027: oil-heated homes × at most $1,000.',
        }
      : {
          property: 'cliffHomes2026',
          breaks: HOMES_BREAKS,
          labels: HOMES_LABELS,
          note: 'Homes that lose up to $1,000 each if they wait for 2027. Nothing is lost yet.',
        }
  }
  if (metric === 'cliff_homes') {
    return year === 2027
      ? {
          property: 'cliffHomes2027',
          breaks: HOMES_BREAKS,
          labels: HOMES_LABELS,
          note: 'Households that lose $1,000 on Jan 1.',
        }
      : {
          property: 'cliffHomes2026',
          breaks: HOMES_BREAKS,
          labels: HOMES_LABELS,
          note: 'Households exposed today; the loss starts Jan 1.',
        }
  }
  return {
    property: heatProperty(metric, year),
    breaks: BREAKS[metric],
    labels: LABELS[metric],
    note: metric === 'oil_share' ? 'Share of occupied homes heating with oil. Same on both sides of Jan 1.' : 'Annual oil spend. Same on both sides of Jan 1.',
  }
}

/** Every property a tract feature carries, in one place, so the stamp and the paint agree. */
export function heatProps(row: HeatRow): Record<string, number> {
  return {
    oilShare: row.oilShare ?? -1,
    oilSpend: row.oilShare === null ? -1 : row.oilSpendUsd,
    cliffHomes2026: row.oilShare === null ? -1 : 0,
    cliffHomes2027: row.oilShare === null ? -1 : row.cliffHomes,
    cliffDollars2026: 0,
    cliffDollars2027: row.oilShare === null ? -1 : row.cliffDollars,
  }
}

// ------------------------------------------------------------------ the whole state

const STATS = statsJson as unknown as {
  tracts: Record<string, number[]>
}

/** Read the committed ACS table once. Order is the file's order, which is stable. */
const ALL_ROWS: readonly HeatRow[] = (() => {
  const rows: HeatRow[] = []
  for (const [geoid, values] of Object.entries(STATS.tracts)) {
    const row = heatRow({ geoid, households: values[1], oilHouseholds: values[2], medianYearBuilt: values[6] })
    if (row) rows.push(row)
  }
  if (rows.length === 0) throw new Error('ma-tract-stats.json: no tracts — run scripts/bake-map.mjs')
  return rows
})()

/** Every tract with an ACS estimate, in GEOID order. The table view's source. */
export function allHeatRows(): readonly HeatRow[] {
  return ALL_ROWS
}

/** One tract by GEOID, or null. */
export function heatRowFor(geoid: string | null): HeatRow | null {
  if (!geoid) return null
  return ALL_ROWS.find((row) => row.geoid === geoid) ?? null
}

/** A roll-up that is valid at any level of the drill. */
export interface HeatTotals {
  tracts: number
  households: number
  oilHouseholds: number
  oilShare: number | null
  oilSpendUsd: number
  cliffHomes: number
  /** Dollars lost if every one of these households installs in 2027 instead of 2026. */
  cliffDollars: number
}

export function sumRows(rows: Iterable<HeatRow>): HeatTotals {
  const totals: HeatTotals = {
    tracts: 0,
    households: 0,
    oilHouseholds: 0,
    oilShare: null,
    oilSpendUsd: 0,
    cliffHomes: 0,
    cliffDollars: 0,
  }
  for (const row of rows) {
    totals.tracts += 1
    totals.households += row.households
    totals.oilHouseholds += row.oilHouseholds
    totals.oilSpendUsd += row.oilSpendUsd
    totals.cliffHomes += row.cliffHomes
    totals.cliffDollars += row.cliffDollars
  }
  totals.oilShare = totals.households > 0 ? totals.oilHouseholds / totals.households : null
  return totals
}

let cachedState: HeatTotals | null = null

/** Statewide totals. Sums the tract table once, so a straddling tract is never double counted. */
export function stateHeatTotals(): HeatTotals {
  if (!cachedState) cachedState = sumRows(ALL_ROWS)
  return cachedState
}

/** One county's figures: the fallback that is true before any geometry loads (R10.13). */
export interface CountyHeatRow extends HeatTotals {
  fips: string
  name: string
}

let cachedCounties: CountyHeatRow[] | null = null

/**
 * County roll-up from the committed tract table, keyed by the county prefix of each
 * GEOID rather than by town lists — a tract that straddles a town line still lands
 * in exactly one county, so the 14 rows sum to the state and nothing is orphaned.
 */
export function countyHeatRows(): readonly CountyHeatRow[] {
  if (cachedCounties) return cachedCounties
  const names = new Map(counties().map((c) => [c.fips, c.name]))
  const byFips = new Map<string, HeatRow[]>()
  for (const row of ALL_ROWS) {
    const fips = row.geoid.slice(0, 5)
    const list = byFips.get(fips)
    if (list) list.push(row)
    else byFips.set(fips, [row])
  }
  const out: CountyHeatRow[] = []
  for (const [fips, rows] of byFips) {
    const totals = sumRows(rows)
    out.push({ fips, name: names.get(fips) ?? `County ${fips}`, ...totals })
  }
  out.sort((a, b) => b.cliffDollars - a.cliffDollars || a.name.localeCompare(b.name))
  cachedCounties = out
  return out
}

/** The statewide sentence the toggle animates. */
export function headline(year: HeatYear): { dollars: number; homes: number; text: string } {
  const totals = stateHeatTotals()
  const dollars = year === 2027 ? totals.cliffDollars : 0
  const homes = year === 2027 ? totals.cliffHomes : 0
  return {
    dollars,
    homes,
    text: year === 2027 ? `up to ${formatMillions(dollars)} lost on Jan 1 if these homes wait until 2027` : '$0 lost',
  }
}

// ------------------------------------------------------------------------- table

/** One row of the accessible table: the panel's numbers, with the towns that own the tract. */
export interface HeatTableRow {
  geoid: string
  /** Towns the tract touches. Empty for the handful of water tracts. */
  towns: string[]
  households: number
  oilHouseholds: number
  oilShare: number | null
  oilSpendUsd: number
  cliffHomes: number
  /** Dollars lost in the given year: zero before 2027, by definition. */
  cliffDollars: number
  medianYearBuilt: number
}

/**
 * The table's rows, biggest cliff first.
 *
 * Sorted by what the reader came for in the current year, then by oil households and
 * GEOID so two renders of the same data never swap rows under a screen reader.
 * `limit` exists for the DOM's sake: 1,620 rows is a large node count on a phone, so
 * the view opens on the worst 50 and offers the whole table behind one click.
 */
export function tableRows(year: HeatYear, limit?: number): HeatTableRow[] {
  const byTract = townsByTract()
  const rows = ALL_ROWS.map((row) => ({
    geoid: row.geoid,
    towns: byTract.get(row.geoid) ?? [],
    households: row.households,
    oilHouseholds: row.oilHouseholds,
    oilShare: row.oilShare,
    oilSpendUsd: row.oilSpendUsd,
    cliffHomes: row.cliffHomes,
    cliffDollars: year === 2027 ? row.cliffDollars : 0,
    medianYearBuilt: row.medianYearBuilt,
  })).sort((a, b) => b.cliffDollars - a.cliffDollars || b.oilHouseholds - a.oilHouseholds || a.geoid.localeCompare(b.geoid))
  return typeof limit === 'number' && limit >= 0 ? rows.slice(0, limit) : rows
}

/** The same rows for one town's tracts, which is what the drill-down asks for. */
export function tableRowsForTown(year: HeatYear, town: string): HeatTableRow[] {
  const geoids = new Set(tractsOfTown(town))
  return tableRows(year).filter((row) => geoids.has(row.geoid))
}

/**
 * tract GEOID → the towns that touch it.
 *
 * Built from `lib/geo`'s own town→tract index rather than a second parse of the
 * county table, so a tract on a town line is listed in both towns, exactly as the
 * panel says.
 */
let cachedByTract: Map<string, string[]> | null = null

function townsByTract(): Map<string, string[]> {
  if (cachedByTract) return cachedByTract
  const index = new Map<string, string[]>()
  for (const town of TOWNS) {
    for (const geoid of tractsOfTown(town)) {
      const list = index.get(geoid)
      if (list) {
        if (!list.includes(town)) list.push(town)
      } else index.set(geoid, [town])
    }
  }
  cachedByTract = index
  return index
}

// ---------------------------------------------------------------------- keyboard

/**
 * The key that a trace of the tract list should answer, as an index.
 *
 * Input: how many rows, which row has focus (-1 for none), and `event.key`.
 * Guarantee: a movement key always lands inside `[0, count)`, Home/End jump, and
 * anything else returns -1 so the caller leaves the key alone (Enter, Tab, letters).
 */
export function nextRowIndex(count: number, current: number, key: string): number {
  if (count <= 0) return -1
  const last = count - 1
  const from = current < 0 || current > last ? 0 : current
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(last, from + 1)
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(0, from - 1)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return -1
  }
}

/** True for the keys `nextRowIndex` moves on, so a handler can `preventDefault` without guessing. */
export function isNavKey(key: string): boolean {
  return nextRowIndex(1, 0, key) >= 0
}

// ----------------------------------------------------------------------- seeding

/**
 * The calculator link for a tract: the onboarding wizard, or the verdict seeded with the tract's own numbers.
 *
 * Design §3: "use this tract" seeds the calculator with that tract's median year
 * built and typical oil use. Typical oil use is the same 750 gal assumption the map
 * charges for, the price is the same DOER reading, and `src=map` plus `tract=…`
 * let the next screen say where the numbers came from. Nothing is computed here:
 * this function only assembles a query the intake form already reads.
 */
export function seedQuery(row: HeatRow, town: string, year: HeatYear): string {
  const note = `From the map: census tract ${row.geoid}, ${ASSUMPTION_NOTE}.`
  const params = new URLSearchParams({
    fuel: 'oil',
    units: String(GAL_PER_HOUSEHOLD),
    price: String(OIL_PRICE_USD_PER_GAL),
    town,
    tier: 'whole',
    inc: 'unsure',
    year: String(year),
    mn: note,
  })
  if (row.medianYearBuilt > 0) params.set('yb', String(row.medianYearBuilt))
  params.set('src', 'map')
  params.set('tract', row.geoid)
  return params.toString()
}

/** The same seed, aimed at the verdict screen instead of the form. */
export function seedHref(row: HeatRow, town: string, year: HeatYear, view: 'start' | 'verdict' = 'start'): string {
  return view === 'start' ? '/onboarding' : `/verdict?${seedQuery(row, town, year)}`
}

// ---------------------------------------------------------------------- formatting

/** Annual oil dollars for a count of oil-heated households. The spend metric, without a row. */
export function oilSpendFor(oilHouseholds: number): number {
  return Math.max(0, oilHouseholds) * GAL_PER_HOUSEHOLD * OIL_PRICE_USD_PER_GAL
}

/** Dollars the Jan 1 step-down costs a count of households. The cliff, without a row. */
export function cliffDollarsFor(oilHouseholds: number): number {
  return Math.max(0, oilHouseholds) * CLIFF_USD_PER_HOME
}

/** "$624.5M" for the headline, "$8,500" for a cap. Never a bare number. */
export function formatMillions(dollars: number): string {
  if (!Number.isFinite(dollars)) return '—'
  const abs = Math.abs(dollars)
  const sign = dollars < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${trim((abs / 1_000_000_000).toFixed(1))}B`
  if (abs >= 1_000_000) return `${sign}$${trim((abs / 1_000_000).toFixed(1))}M`
  if (abs >= 1_000) return `${sign}$${trim((abs / 1_000).toFixed(0))}k`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

function trim(value: string): string {
  return value.replace(/\.0$/, '')
}

/** A unit price with its cents: "$6.23". Rounding a $/gal to the dollar loses the story. */
export function price(dollarsPerUnit: number): string {
  return `$${dollarsPerUnit.toFixed(2)}`
}

/** Money with cents-free commas: "$3,278". */
export function money(dollars: number): string {
  const rounded = Math.round(dollars)
  return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`
}

/** "24.5%". A null share is the panel's "no estimate", never a zero. */
export function percent(share: number | null): string {
  if (share === null || !Number.isFinite(share)) return 'No estimate'
  return `${(Math.round(share * 1000) / 10).toLocaleString('en-US')}%`
}

/** The metric's value as the legend's units: a share, dollars, or homes. */
export function formatMetric(metric: HeatMetric, value: number | null): string {
  if (value === null) return 'No estimate'
  switch (metric) {
    case 'oil_share':
      return percent(value)
    case 'oil_spend':
    case 'cliff_dollars':
      return formatMillions(value)
    case 'cliff_homes':
      return `${Math.round(value).toLocaleString('en-US')} ${value === 1 ? 'home' : 'homes'}`
  }
}

/** The spend sentence, with the assumption attached to the number it qualifies. */
export function oilSpendSentence(row: HeatRow): string {
  return `${money(row.oilSpendUsd)} a year on heating oil (${ASSUMPTION_NOTE} at ${price(OIL_PRICE_USD_PER_GAL)}/gal, DOER ${OIL_PRICE_AS_OF})`
}

/** The cliff sentence, with the caps it came from. */
export function cliffSentence(row: HeatRow): string {
  return `Up to ${money(row.cliffDollars)} lost on Jan 1 if these homes wait until 2027 (${row.cliffHomes.toLocaleString('en-US')} oil-heated ${
    row.cliffHomes === 1 ? 'home' : 'homes'
  } × up to ${money(CLIFF_USD_PER_HOME)})`
}
