'use client'

/**
 * @built F-44 Town tab: utility gate, selected tract stats, town heating-fuel roll-up
 * @built F-46 the tract panel completes: spend, the Jan 1 loss, and "use this tract"
 * @built F-47 the plain-language path when the equity lens shows a high limited-English share
 * @built You vs your town: your monthly kWh against the average home, plus Mass Save incentives and solar
 *
 * The utility line is the correctness gate from `resolveUtility`. A municipal light
 * plant town says so in plain words; a mixed town asks instead of guessing. Every
 * dollar below comes from `lib/map/heat.ts`, and the 750 gal/household assumption is
 * printed next to the spend it qualifies rather than in a tooltip.
 */

import Link from 'next/link'
import { GEO_META, tractStatsOfTown, townsOfTract } from '@/lib/geo'
import { SPONSOR_NAME, UTILITY_META, resolveUtility } from '@/lib/utility'
import {
  ASSUMPTION_NOTE,
  CLIFF_CAPS,
  CLIFF_NOTE,
  CLIFF_SOURCE,
  OIL_PRICE_AS_OF,
  OIL_PRICE_USD_PER_GAL,
  cliffDollarsFor,
  cliffSentence,
  formatMillions,
  heatRowFor,
  money,
  oilSpendFor,
  oilSpendSentence,
  percent,
  price,
  seedHref,
  seedQuery,
  type HeatYear,
} from '@/lib/map/heat'
import { SEASONAL_KWH_PER_MONTH, averageHomeKwh, compareSentence, formatMW, type EnergyMeta, type EnergyTown } from '@/lib/map/energy-model'
import { EJ_META, ejSummary, formatEj, offersPlainLanguage, plainLanguageHref } from '@/lib/map/equity'

const int = (n: number) => n.toLocaleString('en-US')
const day = (iso: string) => iso.slice(0, 10)

export interface TownPanelProps {
  town: string | null
  tract: string | null
  onClearTract: () => void
  energy?: EnergyTown | null
  meta?: EnergyMeta | null
  /** The profile's monthly kWh, or null while it is still the example value. */
  yourKwh?: number | null
  onEditProfile?: () => void
  /** The verdict path to return to, already vetted by `safeBackPath`. */
  backHref?: string | null
  lens?: 'energy' | 'heat'
  /** True when the equity lens is on; the EJ percentages appear only with the lens. */
  ejOn: boolean
  /** The scrubber's install year, so "use this tract" seeds the year being looked at. */
  year: HeatYear
}

export function TownPanel({
  town,
  tract,
  onClearTract,
  energy = null,
  meta = null,
  yourKwh = null,
  onEditProfile,
  backHref = null,
  lens = 'energy',
  ejOn,
  year,
}: TownPanelProps) {
  const back = backHref ? (
    <a className="self-start text-small text-ink underline underline-offset-2" href={backHref}>
      ← Back to your verdict
    </a>
  ) : null
  if (!town) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-small text-ink-muted">
          Pick a town: search for one, or click it on the map. In the Heat lens, click a tract to see its heating-fuel mix.
        </p>
      </div>
    )
  }
  const res = resolveUtility(town)
  const row = heatRowFor(tract)
  const rows = tractStatsOfTown(town)
  const households = rows.reduce((s, r) => s + r.households, 0)
  const oil = rows.reduce((s, r) => s + r.oilHouseholds, 0)
  const location = tract ? (townsOfTract(tract)[0] ?? town) : town

  let utilityLine: string
  if (!res.found) utilityLine = res.reason ?? 'We do not have this town.'
  else if (res.eligibleForMassSave === false) utilityLine = 'Municipal light plant — Mass Save rebates do not apply'
  else if (res.mixed || res.sponsors.length > 1) {
    utilityLine = `Served by ${res.sponsors.map((s) => SPONSOR_NAME[s]).join(' and ')}. Which one bills you depends on your address.`
  } else if (res.eligibleForMassSave === true) utilityLine = `${SPONSOR_NAME[res.sponsors[0]]}, a Mass Save sponsor`
  else utilityLine = res.reason ?? 'Utility not confirmed.'

  return (
    <div className="flex flex-col gap-4">
      {back}
      <section aria-label="Utility">
        <p className="text-eyebrow uppercase text-ink-muted">Electric utility</p>
        <p className="mt-1 text-small text-ink">{utilityLine}</p>
        {res.reason && res.eligibleForMassSave === null ? <p className="mt-1 text-micro text-ink-muted">{res.reason}</p> : null}
        {res.eligibleForMassSave === false ? (
          <p className="mt-1 text-micro text-ink-muted">
            A municipal light plant buys its own power and is not a Mass Save sponsor, so no heat-pump rebate is quoted
            here — and the seasonal heat-pump rate does not apply. The town&apos;s own program may still offer something;
            ask the municipally owned utility directly.
          </p>
        ) : null}
        <p className="mt-1 text-micro text-ink-faint">
          {UTILITY_META.source} · fetched {day(UTILITY_META.fetchedAt)}
        </p>
      </section>

      <YouVsTown town={town} energy={energy} meta={meta} yourKwh={yourKwh} onEditProfile={onEditProfile} />

      <TownPrograms town={town} energy={energy} meta={meta} />

      {row ? (
        <section aria-label="Selected tract" className="rounded-card border border-rule bg-paper p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-eyebrow uppercase text-ink-muted">Census tract {row.geoid}</p>
            <button type="button" onClick={onClearTract} className="text-micro text-ink-muted underline underline-offset-2 hover:text-ink">
              Clear
            </button>
          </div>
          <p className="mt-1 text-micro text-ink-muted">{townsOfTract(row.geoid).join(', ') || 'Massachusetts'}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Occupied homes" value={int(row.households)} />
            <Stat label="Oil-heated share" value={percent(row.oilShare)} />
            <Stat label="Homes on oil" value={int(row.oilHouseholds)} />
            <Stat label="Median year built" value={row.medianYearBuilt > 0 ? String(row.medianYearBuilt) : 'No estimate'} />
            <Stat label="Estimated oil spend" value={`${money(row.oilSpendUsd)}/yr`} />
            <Stat
              label={year === 2027 ? 'Most lost on Jan 1, 2027' : 'Most lost if you wait for 2027'}
              value={money(row.cliffDollars)}
            />
          </dl>
          <p className="mt-2 text-micro text-ink-muted">{oilSpendSentence(row)}.</p>
          <p className="mt-1 text-micro text-ink-muted">{cliffSentence(row)}.</p>
          <p className="mt-1 text-micro text-ink-faint">
            {ASSUMPTION_NOTE} at {price(OIL_PRICE_USD_PER_GAL)}/gal (DOER {OIL_PRICE_AS_OF}). {CLIFF_SOURCE}. Median year
            built from ACS B25035, tract-wide.
          </p>

          <Link
            href={seedHref(row, location, year, 'start')}
            className="mt-3 inline-flex h-9 items-center rounded-md border border-ink bg-ink px-3 text-small font-medium text-paper transition-colors hover:bg-ink-muted"
          >
            Use this tract
          </Link>
          <p className="mt-1.5 text-micro text-ink-faint">
            Seeds the calculator with this tract&apos;s median year built and {ASSUMPTION_NOTE}, at the DOER price. You can
            change every field.
          </p>

          {ejOn ? (
            <div className="mt-3 border-t border-rule pt-2">
              <p className="text-eyebrow uppercase text-ink-muted">Equity lens</p>
              {(() => {
                const summary = ejSummary(row.geoid)
                if (!summary) {
                  return <p className="mt-1 text-micro text-ink-muted">No EJ2020 block group in this tract.</p>
                }
                const ej = formatEj(summary)
                return (
                  <>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                      <Stat label="Minority share" value={ej.minority} />
                      <Stat label="Limited English" value={ej.limitedEnglish} />
                    </dl>
                    <p className="mt-1 text-micro text-ink-faint">
                      MassGIS EJ2020, {summary.blockGroups} EJ block {summary.blockGroups === 1 ? 'group' : 'groups'} in
                      this tract. These percentages describe those block groups, not the whole tract, and they never
                      change a heat value or a ranking. {EJ_META.caveat}
                    </p>
                    {offersPlainLanguage(row.geoid) ? (
                      <p className="mt-2 text-micro text-ink">
                        <Link
                          href={plainLanguageHref(seedQuery(row, location, year))}
                          className="underline decoration-rule-strong underline-offset-2 hover:text-ink-muted"
                        >
                          Read the verdict in plain language
                        </Link>{' '}
                        — {ej.limitedEnglish} of households here have limited English.
                      </p>
                    ) : null}
                  </>
                )
              })()}
            </div>
          ) : null}
        </section>
      ) : null}

      {lens === 'heat' ? (
      <section aria-label="Town heating fuel">
        <p className="text-eyebrow uppercase text-ink-muted">Heating oil in {town}</p>
        {households > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Oil-heated share" value={percent(oil / households)} />
            <Stat label="Oil-heated homes" value={int(oil)} />
            <Stat label="Oil spend" value={`${formatMillions(oilSpendFor(oil))}/yr`} />
            <Stat label="Most lost on Jan 1" value={formatMillions(cliffDollarsFor(oil))} />
          </dl>
        ) : (
          <p className="mt-1 text-small text-ink-muted">No tract estimates for this town.</p>
        )}
        <p className="mt-2 text-micro text-ink-faint">
          Sums the {rows.length} tracts that touch the town; a tract on a town line is counted whole in each town. Spend{' '}
          {ASSUMPTION_NOTE}. The 2027 cap is {money(CLIFF_CAPS[2027])} against {money(CLIFF_CAPS[2026])} today. {CLIFF_NOTE}
        </p>
      </section>
      ) : null}

      {lens === 'heat' || row ? (
        <p className="text-micro text-ink-faint">
          {GEO_META.tractStats.source.split(' — ')[0]} · B25040 · fetched {day(GEO_META.tractStats.fetchedAt)}. Estimates
          carry sampling error; read a small tract as a share.
        </p>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="num text-body font-medium text-ink">{value}</dd>
    </div>
  )
}

const kwh = (n: number) => Math.round(n).toLocaleString('en-US')

function YouVsTown({
  town,
  energy,
  meta,
  yourKwh,
  onEditProfile,
}: {
  town: string
  energy: EnergyTown | null
  meta: EnergyMeta | null
  yourKwh: number | null
  onEditProfile?: () => void
}) {
  if (!energy || !meta) return null
  const avg = averageHomeKwh(energy)
  const src = `${meta.sources.usage.label} ${meta.sources.usage.year} ÷ Census ACS 5-yr households`
  return (
    <section aria-label="You vs your town" className="flex flex-col gap-2 border-t border-rule pt-4">
      <p className="text-eyebrow uppercase text-ink-muted">You vs your town</p>
      {avg.status === 'hidden' ? (
        <p className="text-small text-ink-muted">{avg.reason} There is no average home to compare with.</p>
      ) : (
        <>
          <p className="num text-small text-ink">
            {yourKwh !== null ? <>You: {kwh(yourKwh)} kWh/month · </> : null}
            Average home in {town}: {kwh(avg.kwhPerMonth)} kWh/month
          </p>
          <p className="text-micro text-ink-faint">({src})</p>
          {yourKwh !== null && avg.kwhPerMonth > SEASONAL_KWH_PER_MONTH ? (
            <p className="text-small text-ink-muted">Seasonal homes push this town&apos;s average up, so compare loosely.</p>
          ) : yourKwh !== null ? (
            <>
              <div className="flex flex-col gap-1.5" role="img" aria-label={`You ${kwh(yourKwh)} kilowatt-hours a month, average home ${kwh(avg.kwhPerMonth)}`}>
                <Bar label="You" value={yourKwh} max={Math.max(yourKwh, avg.kwhPerMonth)} tone="bg-ink" />
                <Bar label="Average" value={avg.kwhPerMonth} max={Math.max(yourKwh, avg.kwhPerMonth)} tone="bg-ink-faint" />
              </div>
              <p className="text-small font-medium text-ink">{compareSentence(yourKwh, avg.kwhPerMonth, town)}</p>
            </>
          ) : (
            <p className="text-small text-ink-muted">
              Add your monthly kWh to compare.{' '}
              {onEditProfile ? (
                <button type="button" onClick={onEditProfile} className="underline underline-offset-2 hover:text-ink">
                  Open My home
                </button>
              ) : null}
            </p>
          )}
          <p className="text-micro text-ink-faint">
            A rough guide, not an exact average: Mass Save&apos;s residential total divided by Census occupied households. Towns with many apartments read low; towns with many seasonal homes read high.
          </p>
        </>
      )}
    </section>
  )
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="w-14 shrink-0 text-micro text-ink-muted">{label}</span>
      <span className="h-3 flex-1 rounded-sm bg-paper-sunk">
        <span className={`block h-3 rounded-sm ${tone}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
      </span>
    </div>
  )
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function TownPrograms({ town, energy, meta }: { town: string; energy: EnergyTown | null; meta: EnergyMeta | null }) {
  if (!energy || !meta) return null
  const { usage, solar } = meta.sources
  return (
    <section aria-label="Mass Save and solar" className="flex flex-col gap-2 border-t border-rule pt-4">
      {energy.incentivesUsd !== null ? (
        <p className="text-small text-ink">
          Residents of {town} received {usd(energy.incentivesUsd)} in Mass Save electric incentives in {usage.year}.{' '}
          <span className="text-micro text-ink-muted">{`${usage.label} · ${usage.year}`}</span>
        </p>
      ) : energy.usage.status === 'suppressed' ? (
        <p className="text-small text-ink">
          Mass Save suppressed {town}&apos;s incentive total for privacy.{' '}
          <span className="text-micro text-ink-muted">{`${usage.label} · ${usage.year}`}</span>
        </p>
      ) : null}
      <p className="text-small text-ink">
        {formatMW(energy.solarMW)} of solar installed across {energy.solarSystems.toLocaleString('en-US')} systems.{' '}
        <span className="text-micro text-ink-muted">{`${solar.label} · ${MONTH[Number(solar.asOf.slice(5, 7)) - 1]} ${solar.asOf.slice(0, 4)}`}</span>
      </p>
    </section>
  )
}
