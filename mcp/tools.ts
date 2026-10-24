/**
 * @built F-154 Switchpoint MCP tool handlers — the verdict engine, the sponsor gate and the
 * rebate tables as plain functions, so the MCP server is a thin transport and the
 * handlers are testable without a process.
 *
 * Every handler delegates to code the app already ships (`lib/calc`, `lib/utility`).
 * Nothing here computes a number of its own: the server exists so an agent can ask
 * the same engine the UI asks, instead of re-deriving arithmetic in prose.
 */
import { computeVerdict, refusalFor } from '../lib/calc'
import { FUEL_SNAPSHOT_2026_10_19, rulesForYear, tierRule } from '../lib/calc/rules'
import type { HeatingInput, Tier, UpgradeInput } from '../lib/calc/types'
import { resolveUtility } from '../lib/utility'

/** What every handler returns: a JSON-serialisable payload plus whether it is an error. */
export interface ToolReply {
  ok: boolean
  data: unknown
}

/**
 * Run the verdict engine on a heating description and an upgrade.
 * Input: HeatingInput + UpgradeInput as in `lib/calc/types.ts` (USD, gal/therm/kWh).
 * Guarantee: a refusal comes back as `{ ok: false, refusal }`, never as a guessed verdict.
 */
export function computeVerdictTool(heating: HeatingInput, upgrade: UpgradeInput): ToolReply {
  const refusal = refusalFor(heating, upgrade)
  if (refusal) return { ok: false, data: { refusal } }
  const result = computeVerdict(heating, upgrade)
  if (!result) {
    return { ok: false, data: { refusal: { code: 'unanswerable', field: 'inputs', message: 'The engine could not answer these inputs.' } } }
  }
  return { ok: true, data: result }
}

/**
 * Resolve a Massachusetts town to its Mass Save sponsor(s) and eligibility gate.
 * Input: a town name in any casing. Guarantee: an unknown or mixed town returns a
 * `question` to put to the user; no default sponsor is ever substituted.
 */
export function lookupSponsorTool(town: string): ToolReply {
  const resolution = resolveUtility(town)
  return { ok: resolution.found, data: resolution }
}

/**
 * Read one rebate tier for one install year straight from `data/rules/*.json`.
 * Input: install year (2026 | 2027) and tier. Output: per-ton rate, caps, bonuses,
 * eligible fuels and the documentation deadline. Guarantee: an unsupported year or
 * tier is an error, not a nearby row.
 */
export function getProgramRuleTool(year: number, tier: Tier): ToolReply {
  const rules = rulesForYear(year)
  if (!rules) return { ok: false, data: { error: `No rebate table for ${year}. Only 2026 and 2027 are modelled.` } }
  const rule = tierRule(year, tier)
  if (!rule) return { ok: false, data: { error: `Unknown tier "${tier}" for ${year}.` } }
  return {
    ok: true,
    data: {
      year,
      tier,
      rule,
      installWindow: rules.installWindow,
      documentationDeadline: rules.documentationDeadline,
      source: rules.source,
    },
  }
}

/** The dated DOER fuel snapshot the app falls back to. Guarantee: carries its own `asOf`. */
export function getFuelSnapshotTool(): ToolReply {
  return { ok: true, data: FUEL_SNAPSHOT_2026_10_19 }
}
