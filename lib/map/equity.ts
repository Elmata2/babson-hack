/**
 * @built F-58 the equity lens: MassGIS EJ2020 percentages, read as a lens and never as a heat value
 * @built F-47 the plain-language path a high limited-English share turns on (R10.11)
 *
 * R10.9 is a design constraint before it is a feature: toggling the equity layer must
 * not change the heat numbers, the ranking, or the fill. So this module exports the
 * two percentages the source publishes — `PCT_MINORITY` and `LIMENGHHPCT` — and
 * nothing that could reach a choropleth value. The panel prints them; `layers.ts`
 * never reads them.
 *
 * The artefact's own caveat governs the copy: EJ2020 publishes *EJ-designated block
 * groups only*, so these percentages describe a tract's EJ block groups, never the
 * whole tract. The UI says "EJ block groups" every time it shows them.
 *
 * Pure: one committed artefact, no clock, no network, no DOM.
 */

import ejJson from '../../public/data/ej-blockgroups.json'

/** One tract's EJ block-group roll-up, exactly as the bake aggregated it. */
export interface EjSummary {
  /** Number of EJ-designated block groups in the tract. */
  blockGroups: number
  /** Population summed across those block groups. */
  population: number
  /** `PCT_MINORITY`, population weighted, 0–100. */
  minorityPct: number
  /** `LIMENGHHPCT`, household weighted, 0–100. */
  limitedEnglishPct: number
  /** Mean of the block groups' median incomes. Not a true tract median. */
  medianIncomeUsd: number
}

/** The shape of `public/data/ej-blockgroups.json`. */
interface EjArtefact {
  _meta: {
    source: string
    url: string
    fetchedAt: string
    recordCount: number
    coverage: string
    caveat: string
  }
  /** GEOID → [blockGroups, population, pctMinority, limitedEnglishPct, medianIncome]. */
  tracts: Record<string, [number, number, number, number, number]>
}

const ARTEFACT = ejJson as unknown as EjArtefact

/** Provenance and the honest limits, for the panel's source line. */
export const EJ_META = {
  source: ARTEFACT._meta.source,
  fetchedAt: ARTEFACT._meta.fetchedAt,
  recordCount: ARTEFACT._meta.recordCount,
  coverage: ARTEFACT._meta.coverage,
  caveat: ARTEFACT._meta.caveat,
} as const

/**
 * The limited-English share at which the panel offers the plain-language verdict.
 *
 * One household in ten. This is an offer, not a determination: the EJ2020 criteria
 * are a different threshold for a different purpose, and MassGIS publishes a share,
 * not a person. The link is additive — the numbers are on screen either way.
 */
export const PLAIN_LANGUAGE_THRESHOLD_PCT = 10

function read(value: ReadonlyArray<number> | undefined): EjSummary | null {
  if (!Array.isArray(value) || value.length < 5) return null
  const [blockGroups, population, minorityPct, limitedEnglishPct, medianIncomeUsd] = value
  if (![blockGroups, population, minorityPct, limitedEnglishPct, medianIncomeUsd].every((n) => Number.isFinite(n))) return null
  return { blockGroups, population, minorityPct, limitedEnglishPct, medianIncomeUsd }
}

const INDEX: Map<string, EjSummary> = (() => {
  const map = new Map<string, EjSummary>()
  for (const [geoid, values] of Object.entries(ARTEFACT.tracts ?? {})) {
    const summary = read(values)
    if (summary) map.set(geoid, summary)
  }
  if (map.size === 0) throw new Error('ej-blockgroups.json: no tracts — run scripts/bake-map.mjs')
  return map
})()

/** Tracts that hold at least one EJ block group. The overlay's filter. */
export const EJ_TRACTS: ReadonlySet<string> = new Set(INDEX.keys())

/** The summary for one tract, or null when it holds no EJ block group. */
export function ejSummary(geoid: string | null): EjSummary | null {
  if (!geoid) return null
  return INDEX.get(geoid) ?? null
}

/** True when the panel should offer the plain-language verdict for this tract. */
export function offersPlainLanguage(geoid: string | null): boolean {
  const summary = ejSummary(geoid)
  return summary !== null && summary.limitedEnglishPct >= PLAIN_LANGUAGE_THRESHOLD_PCT
}

/**
 * The verdict link with the plain-language panel in view.
 *
 * There is no separate translated route to invent: `/verdict` already renders the
 * plain-English panel under `#plain-english` (R14.4), so the equity path is the same
 * verdict with the reader's own numbers, scrolled to that panel, and `plain=1` so a
 * plainer route can claim the same link when it lands.
 */
export function plainLanguageHref(seed: string): string {
  const query = new URLSearchParams(seed)
  query.set('plain', '1')
  return `/verdict?${query.toString()}#plain-english`
}

/** The two percentages, formatted for the panel. Never used for colour or ranking. */
export function formatEj(summary: EjSummary): { minority: string; limitedEnglish: string } {
  const pct = (value: number) => `${(Math.round(value * 10) / 10).toLocaleString('en-US')}%`
  return { minority: pct(summary.minorityPct), limitedEnglish: pct(summary.limitedEnglishPct) }
}
