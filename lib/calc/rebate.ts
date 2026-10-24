/**
 * @built F-18 rebate by tier × tonnage × install year, with bonuses and caps
 *
 * Program numbers are never typed here: they come from `rules.ts`, which mirrors
 * `.kiro/steering/mass-save-rules.md`. Invariant: `base ≤ cap`, `total ≤
 * capAfterBonuses`, `total ≤ installCost` when a cost is known.
 */

import { MAX_INSTALL_COST_USD } from './constants'
import { isTier, rulesForYear, TIER_LABEL } from './rules'
import type { Assumption, Fuel, RebateLine, RebateResult, Tier } from './types'

/** Optional context for a rebate calculation. */
export interface RebateOptions {
  /** Quoted or assumed install cost, USD. Required for the enhanced tier. */
  installCost?: number
  /** +$500 weatherization bonus (assessment + work) on whole/partial. */
  weatherizationBonus?: boolean
  /** +$500 sizing bonus (Manual J within 90–120%) on whole/partial. */
  sizingBonus?: boolean
  /** Pre-existing fuel. Required to decide enhanced-tier eligibility. */
  fuel?: Fuel
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function usd(amount: number): string {
  const abs = Math.abs(amount)
  return `${amount < 0 ? '-' : ''}$${Math.round(abs).toLocaleString('en-US')}`
}

/**
 * Rebate for one tier, tonnage and install year.
 * Input: tier, cooling tons, install year, and optional install cost / bonuses /
 * fuel. Output: `total` USD plus a line-item breakdown whose amounts sum to
 * `total`. Guarantee: never exceeds the tier cap, the post-bonus cap, or the
 * install cost; `null` for an unknown year, tier, or tonnage.
 */
export function rebate(
  tier: Tier,
  tons: number,
  installYear: number,
  opts: RebateOptions = {},
): RebateResult | null {
  if (!isTier(tier)) return null
  const rules = rulesForYear(installYear)
  if (!rules) return null
  if (!isFiniteNumber(tons) || tons <= 0) return null
  if (opts.installCost !== undefined) {
    if (!isFiniteNumber(opts.installCost) || opts.installCost <= 0 || opts.installCost > MAX_INSTALL_COST_USD) {
      return null
    }
  }

  const tierLabel = TIER_LABEL[tier]
  const rule = rules.tiers[tier]
  const assumptions: Assumption[] = [
    {
      field: 'tier',
      value: `${tierLabel} ${installYear}`,
      reason:
        'Tiers are treated as mutually exclusive in this build: the basic rebate is not stacked onto whole/partial-home for unconditioned space, and the enhanced tier replaces the per-ton award instead of adding to it.',
    },
  ]

  // ---- eligibility (the enhanced tier is closed to gas, per steering §1)
  const fuelAllowed = opts.fuel === undefined ? null : rule.eligibleFuels.includes(opts.fuel)
  if (tier === 'enhanced' && fuelAllowed !== true) {
    const why =
      opts.fuel === undefined
        ? 'The enhanced tier is income-qualified and only open when the displaced fuel is known. Supply the existing fuel (oil, propane or electric resistance) before this rebate can be estimated.'
        : `The enhanced tier is only available where the displaced fuel is oil, propane or electric resistance. A ${opts.fuel} home is not eligible.`
    return {
      total: 0,
      base: 0,
      bonuses: 0,
      cap: rule.capUsd,
      capAfterBonuses: rule.capAfterBonusesUsd,
      eligible: false,
      reason: why,
      breakdown: [],
      assumptions: [
        ...assumptions,
        {
          field: 'rebate',
          value: '$0',
          reason: 'No rebate is modelled for an ineligible tier; call 888-714-3990 to check income eligibility for the standard tiers.',
        },
      ],
    }
  }

  const lines: RebateLine[] = []
  let base = 0

  if (rule.mode === 'cost_cap') {
    const installCost = opts.installCost
    if (installCost === undefined) return null
    base = Math.min(installCost, rule.capUsd)
    lines.push({
      label: `Enhanced rebate: lower of install cost ${usd(installCost)} and the ${usd(rule.capUsd)} cap`,
      amount: base,
      source: `${rules.source} · ${installYear} enhanced cap`,
    })
    assumptions.push({
      field: 'rebate',
      value: usd(base),
      reason: `The enhanced tier is modelled as min(install cost, ${usd(rule.capUsd)}), which reproduces Mass Save's published example ($22,000 install → $16,000 rebate → $6,000 net). Income eligibility is not verified; the program decides.`,
    })
  } else {
    const perTon = rule.perTonUsd ?? 0
    const uncapped = tons * perTon
    base = Math.min(uncapped, rule.capUsd)
    // The award line stays at what the per-ton rate actually pays; the cap is its
    // own negative line. Showing the capped number twice made the stack sum to
    // less than the rebate the household receives.
    lines.push({
      label: `${installYear} ${tierLabel} rebate: ${tons} ton × ${usd(perTon)}`,
      amount: uncapped,
      source: `${rules.source} · ${installYear} ${tierLabel} ${usd(perTon)}/ton`,
    })
    if (uncapped > base) {
      lines.push({
        label: `Capped at ${usd(rule.capUsd)}`,
        amount: base - uncapped,
        source: `${rules.source} · ${installYear} cap`,
      })
    }
    assumptions.push({
      field: 'tons',
      value: `${tons} ton`,
      reason:
        'Mass Save pays on AHRI cooling capacity, not heating capacity; tonnage here is the rounded design load, so confirm it against the equipment submittal.',
    })
  }

  // ---- bonuses: only whole/partial carry them, and only before the cap
  let bonuses = 0
  const requestedBonus = opts.weatherizationBonus === true || opts.sizingBonus === true
  if (requestedBonus && rule.bonuses === null) {
    assumptions.push({
      field: 'bonuses',
      value: '$0',
      reason: `The ${tierLabel} tier pays no bonuses in ${installYear}.`,
    })
  }
  if (rule.bonuses !== null) {
    if (opts.weatherizationBonus === true) {
      bonuses += rule.bonuses.weatherizationUsd
      lines.push({
        label: 'Weatherization bonus',
        amount: rule.bonuses.weatherizationUsd,
        source: `${rules.source} · ${installYear} bonus (assessment + work)`,
      })
    }
    if (opts.sizingBonus === true) {
      bonuses += rule.bonuses.sizingUsd
      lines.push({
        label: 'Sizing bonus (Manual J, 90–120% of load)',
        amount: rule.bonuses.sizingUsd,
        source: `${rules.source} · ${installYear} bonus (load calc submitted)`,
      })
    }
  }

  let total = Math.min(base + bonuses, rule.capAfterBonusesUsd)
  if (base + bonuses > rule.capAfterBonusesUsd) {
    lines.push({
      label: `Capped at ${usd(rule.capAfterBonusesUsd)} after bonuses`,
      amount: total - (base + bonuses),
      source: `${rules.source} · ${installYear} post-bonus cap`,
    })
    bonuses = Math.max(0, total - base)
  }

  // ---- never more than the install actually costs
  const installCost = opts.installCost
  if (installCost !== undefined && total > installCost) {
    lines.push({
      label: `Limited to install cost ${usd(installCost)}`,
      amount: installCost - total,
      source: 'Total rebate is never greater than the install cost.',
    })
    total = installCost
  }

  const capBase = base
  return {
    total,
    base: capBase,
    bonuses,
    cap: rule.capUsd,
    capAfterBonuses: rule.capAfterBonusesUsd,
    eligible: true,
    reason: null,
    breakdown: lines,
    assumptions,
  }
}
