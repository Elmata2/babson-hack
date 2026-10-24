import Link from 'next/link'

import { HEAT_PUMP_RULES_2026, TIER_LABEL, rulesForYear, rulesSourceLabel, tierRule } from '@/lib/calc/rules'
import type { Fuel, Tier, VerdictResult } from '@/lib/calc/types'
import {
  BONUS_COPY,
  BONUS_KEYS,
  bonusOn,
  enhancedTierNote,
  withBonus,
  type Income,
} from '@/lib/intake/params'

/**
 * @built F-35 the rebate stack — the line items, the tier chosen, why it was chosen,
 * and what 1 January 2027 does to this household's dollars
 * @built F-35 the two +$500 bonuses are toggles that are links: the verdict stays a
 * server render and the URL keeps the household's claim, so "Change the numbers"
 * loses nothing
 *
 * R5 in the requirements is one screen, not one number. Every line carries where
 * it came from, the cap is shown as its own negative line so the stack adds up to
 * the total, and the difference between the 2026 and 2027 tables is stated in
 * dollars for this tonnage — not as an adjective.
 */

const usd = (value: number): string =>
  `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })}`

const TIER_WHY: Record<Tier, string> = {
  whole: 'You are replacing the whole heating system, so the whole-home tier pays per cooling ton.',
  partial: 'You are adding to the system you have, so the partial-home tier pays per cooling ton.',
  basic: 'The basic tier applies where no fossil fuel or electric-resistance heat is displaced; it pays no bonuses.',
  enhanced:
    'You told us the household is under the Mass Save income limit, so the income-qualified tier replaces the per-ton award. Thresholds are not published: a Home Energy Assessment decides.',
}

export interface RebateStackProps {
  result: VerdictResult
  fuel: Fuel
  income: Income
  /** The verdict's own query. Each bonus toggle is a link built from it. */
  params: Record<string, string | string[] | undefined>
  /** Municipal light plant: no Mass Save electric rebate exists, so there is no stack. */
  noMassSave: boolean
}

export function RebateStack({ result, fuel, income, params, noMassSave }: RebateStackProps) {
  if (noMassSave) return null

  const rule = tierRule(result.installYear, result.tier)
  const rules = rulesForYear(result.installYear)
  const tierLabel = TIER_LABEL[result.tier]
  const note = enhancedTierNote(fuel, income, result.tier)
  const bonuses = result.rebateEligible ? rule?.bonuses ?? null : null
  const install2026 = result.installYear === 2026

  const cliffLine = install2026
    ? result.cliffCost > 0
      ? `What changes on 1 January 2027: the same ${tierLabel} stack pays ${usd(result.rebate2027)}, so waiting costs this household ${usd(result.cliffCost)}. Paperwork for the 2026 award must reach Mass Save by ${HEAT_PUMP_RULES_2026.documentationDeadline ?? '2027-02-28'}.`
      : `What changes on 1 January 2027: nothing for this stack. The same ${tierLabel} award of ${usd(result.rebate2027)} survives the step-down, so the deadline is worth less to you than to a higher-tonnage house.`
    : `You picked a 2027 install, so the ${tierLabel} stack pays ${usd(result.rebate2027)}. The 2026 window paid ${usd(result.rebate2026)}: waiting costs this household ${usd(result.cliffCost)}.`

  return (
    <section className="mt-4 rounded-card border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-small font-medium">The rebate stack</h2>
        <span className="text-micro text-ink-faint">
          {result.installYear} table · {result.tons.toFixed(1)} tons
        </span>
      </div>

      <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
        <span className="text-ink">{tierLabel}</span> · {TIER_WHY[result.tier]}
      </p>

      {note ? (
        <p
          data-tone="hold"
          className="mt-3 rounded-card border border-rule border-l-4 border-l-(--tone) bg-(--tone-tint) px-3 py-2 text-micro text-ink"
        >
          {note}
        </p>
      ) : null}

      {result.rebateEligible ? (
        <dl className="mt-4 divide-y divide-rule border-y border-rule">
          {result.rebateBreakdown.map((line) => (
            <div key={line.label} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_6rem] sm:gap-4">
              <dt className="text-small text-ink">{line.label}</dt>
              <dd className="text-small tabular-nums text-ink sm:text-right">{usd(line.amount)}</dd>
            </div>
          ))}
          <div className="grid gap-2 py-3 sm:grid-cols-[1fr_6rem] sm:items-baseline sm:gap-4">
            <dt className="text-small font-medium text-ink">
              Rebate you receive
              <span className="mt-0.5 block text-micro font-normal text-ink-faint">
                {rules ? rulesSourceLabel(rules) : null}
              </span>
            </dt>
            <dd className="text-title font-medium tabular-nums text-ink sm:text-right">{usd(result.totalRebate)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 border-t border-rule pt-3 text-small text-ink">
          No rebate is modelled for this tier at this address, so the stack is empty rather than zero.
        </p>
      )}

      {bonuses ? (
        <div className="mt-4 grid gap-2 border-t border-rule pt-4">
          <p className="text-micro text-ink-faint">
            Each bonus is your claim, not our assumption. Add it only if it is true, and the stack recomputes.
          </p>
          {BONUS_KEYS.map((key) => {
            const copy = BONUS_COPY[key]
            const amount = key === 'wz' ? bonuses.weatherizationUsd : bonuses.sizingUsd
            const on = bonusOn(params, key)
            return (
              <div key={key} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4">
                <div>
                  <p className="text-small text-ink">
                    {copy.label} bonus +{usd(amount)}
                  </p>
                  <p className="text-micro text-ink-faint">{copy.hint}</p>
                </div>
                <Link
                  href={`/verdict?${withBonus(params, key)}`}
                  className={`justify-self-start whitespace-nowrap rounded-pill border px-3 py-1 text-micro transition-colors ${
                    on
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {on ? 'Added · remove' : 'Add'}
                  <span className="sr-only">
                    {' '}
                    the {copy.label.toLowerCase()} bonus
                  </span>
                </Link>
              </div>
            )
          })}
        </div>
      ) : result.rebateEligible ? (
        <p className="mt-4 border-t border-rule pt-3 text-micro text-ink-muted">
          The {tierLabel} tier pays no weatherization or sizing bonus.
        </p>
      ) : null}

      <p className="mt-4 border-t border-rule pt-4 text-small text-ink">{cliffLine}</p>
    </section>
  )
}
