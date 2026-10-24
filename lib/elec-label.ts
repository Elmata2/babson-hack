/**
 * @built F-60 the `ELEC_LABEL` parser, one implementation shared by the bake and the gate
 *
 * The MassGIS ElectricityProviders layer stores the sponsor as a display label,
 * and that label is frequently a comma-joined list: Lakeville is
 * `"Municipal, NSTAR Electric d/b/a Eversource Energy"`. Taking the first string
 * would quote a Mass Save rebate to a municipal-light-plant customer, which is
 * the exact failure this product exists to prevent.
 *
 * So parsing is a first-class, tested unit — not a `.split(',')[0]`. This file
 * has no imports on purpose: `scripts/bake-utilities.mjs` loads it directly
 * through Node's type stripping, so the bake and the runtime cannot disagree.
 */

/** Canonical sponsor keys. These are the only values the verdict path accepts. */
export type SponsorKey =
  | 'eversource'
  | 'nationalgrid'
  | 'unitil'
  | 'cape_light'
  | 'municipal'
  | 'other'

/** Stable order for output, so artefacts diff cleanly between bakes. */
export const SPONSOR_ORDER: readonly SponsorKey[] = [
  'municipal',
  'eversource',
  'nationalgrid',
  'unitil',
  'cape_light',
  'other',
]

/** Human labels. The UI never derives a name from a key. */
export const SPONSOR_LABEL: Record<SponsorKey, string> = {
  eversource: 'Eversource',
  nationalgrid: 'National Grid',
  unitil: 'Unitil',
  cape_light: 'Cape Light Compact',
  municipal: 'Municipal light plant',
  other: 'Utility not on file',
}

/** One parsed `ELEC_LABEL` value. */
export interface ParsedElecLabel {
  /** Canonical sponsors, deduped, in `SPONSOR_ORDER`. */
  sponsors: SponsorKey[]
  /** A municipal light plant is named anywhere in the label. */
  hasMunicipal: boolean
  /**
   * More than one sponsor serves the town.
   *
   * Deliberately wider than design.md §3 ("municipal + IOU"): eight towns are
   * listed with two IOUs, and there the seasonal rate rule differs (−$0.07 vs
   * −$0.04), so a single answer would be a guess. One town, one set of answers,
   * one question: "which utility bills you?"
   */
  mixed: boolean
  /** Tokens that named no known sponsor. Empty for every town in the bake. */
  unresolved: string[]
}

/** A sponsor token matcher. First match wins, so order is meaningful. */
const MATCHERS: ReadonlyArray<{ key: SponsorKey; pattern: RegExp }> = [
  { key: 'municipal', pattern: /municipal|light\s+plant|light\s+department|m\.?l\.?p\.?\b/i },
  // NSTAR before "Massachusetts Electric": both strings contain "electric".
  { key: 'eversource', pattern: /eversource|nstar/i },
  { key: 'nationalgrid', pattern: /national\s*grid|massachusetts\s+electric|nantucket\s+electric/i },
  { key: 'unitil', pattern: /unitil/i },
  { key: 'cape_light', pattern: /cape\s+light/i },
]

/**
 * Split on the separators ArcGIS actually emits, plus the ones it might.
 * Never on "/": "NSTAR Electric d/b/a Eversource Energy" would become "d", "b",
 * "a Eversource Energy" and every town would land in `other`.
 */
const SEPARATORS = /\s*[,;|]\s*|\s+\+\s+/

/**
 * Parse one `ELEC_LABEL` value.
 * Input: the raw ArcGIS string (or null/undefined/empty).
 * Guarantee: total function — malformed input yields no sponsors rather than a
 * guessed one, and the caller can see exactly which tokens were not recognised.
 */
export function parseElecLabel(raw: unknown): ParsedElecLabel {
  const text = typeof raw === 'string' ? raw : ''
  const tokens = text
    .split(SEPARATORS)
    .map((token) => token.replace(/\s+/g, ' ').trim())
    .filter((token) => token.length > 0)

  const found = new Set<SponsorKey>()
  const unresolved: string[] = []

  for (const token of tokens) {
    const match = MATCHERS.find((m) => m.pattern.test(token))
    if (match) found.add(match.key)
    else unresolved.push(token)
  }

  // An unrecognised sponsor is real: keep the town addressable but never claim
  // Mass Save eligibility on a name we could not place.
  if (unresolved.length > 0) found.add('other')

  const sponsors = SPONSOR_ORDER.filter((key) => found.has(key))
  return {
    sponsors,
    hasMunicipal: sponsors.includes('municipal'),
    mixed: sponsors.length > 1,
    unresolved,
  }
}

/**
 * Normalise a Massachusetts town name to a lookup key.
 * Input: "Town of Framingham", "fRAMINGHAM", "  Manchester-by-the-Sea ".
 * Guarantee: no allow-list, no fuzzy matching against a subset — the key is
 * derived from the name itself, so all 351 municipalities behave the same.
 */
export function townKey(name: unknown): string {
  if (typeof name !== 'string') return ''
  let value = name.trim().toLowerCase()
  value = value.replace(/^(town|city|commonwealth)\s+of\s+/, '')
  value = value.replace(/\s+town$/, '')
  value = value.replace(/[\u2018\u2019]/g, "'")
  value = value.replace(/\s+/g, ' ')
  return value
}

/** Title-case a town name for display: "manchester-by-the-sea" → "Manchester-by-the-Sea". */
export function titleCaseTown(name: string): string {
  const small = new Set(['of', 'the', 'and', 'by', 'on', 'at'])
  let seenWord = 0
  return name
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
          if (isSmall) return chunk
          return chunk[0].toUpperCase() + chunk.slice(1)
        })
        .join('-')
      seenWord += 1
      return out
    })
    .join(' ')
}
