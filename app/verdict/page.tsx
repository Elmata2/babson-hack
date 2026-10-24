import type { Metadata } from 'next'
import Link from 'next/link'

import { FreshnessBadge } from '@/components/freshness-badge'
import { Figure, ProvenanceProvider } from '@/components/provenance'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { computeVerdict, refusalFor } from '@/lib/calc'
import { rulesForYear } from '@/lib/calc/rules'
import type { Fuel, Tier } from '@/lib/calc/types'
import { countyOfTown, displayTown, GEO_META, hdd65ForTown } from '@/lib/geo'
import { plausibleElectricRate, provenanceLine, queryString } from '@/lib/intake/params'
import { getPrices } from '@/lib/prices'
import { resolveUtility, SPONSOR_NAME, seasonalHeatPumpRate } from '@/lib/utility'
import { provenanceFor, type ProvenanceContext, type SourceRef } from '@/lib/verdict/provenance'
import { VERDICT_META } from '@/lib/verdicts'

/**
 * @built F-36 provenance wired into the screen — every printed figure opens its formula,
 * its substituted values and its dated source in the drawer
 * @built F-106 round-trip + provenance: the change link carries the whole query; the bill's
 * method, note and confidence, and a household electricity rate (`er`), show up here
 * @built F-32 verdict screen shell — one number, big, unmissable
 *
 * Server-rendered from the URL and `lib/calc`. No client JavaScript is needed to
 * see the answer, no API route is involved, and the same link recomputes the same
 * number tomorrow at tomorrow's prices, with the date on screen.
 *
 * What is deliberately not here yet: the dial (F-34), the number flip (F-33) and
 * the explanation (F-39). This is the shell those hang on. The provenance drawer
 * (F-36) hangs here: every figure below is a `Figure` that opens its formula, its
 * substituted values and its dated source.
 *
 * The municipal-light-plant gate is applied here in its minimal honest form: if
 * the town is served by a municipal department, Mass Save electric rebates do not
 * exist for this address, so the screen refuses to print a rebate-adjusted
 * payback at all. Full refusal state and copy land with F-57.
 */

const FUELS: readonly Fuel[] = ['oil', 'propane', 'gas', 'resistance']
const TIERS: readonly Tier[] = ['whole', 'partial', 'basic', 'enhanced']

const usd = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const cents = (ratePerKWh: number): string => `${(ratePerKWh * 100).toFixed(1)}¢`

const FUEL_LABEL: Record<Fuel, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

const UNIT_LABEL: Record<Fuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therms',
  resistance: 'kWh',
}

export const metadata: Metadata = {
  title: 'Verdict',
  description: 'The honest heat pump verdict for this house, with its arithmetic and its sources.',
  robots: { index: false, follow: false },
}

interface VerdictPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function number(value: string | string[] | undefined): number | null {
  const raw = first(value)
  if (raw === null || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export default async function VerdictPage({ searchParams }: VerdictPageProps) {
  const params = await searchParams
  const fuelRaw = first(params.fuel)
  const tierRaw = first(params.tier)
  const yearRaw = first(params.year)
  const townRaw = first(params.town) ?? ''

  const fuel = FUELS.find((candidate) => candidate === fuelRaw) ?? null
  const tier = TIERS.find((candidate) => candidate === tierRaw) ?? null
  const installYear: 2026 | 2027 | null =
    yearRaw === '2027' ? 2027 : yearRaw === '2026' ? 2026 : null

  const units = number(params.units)
  const unitPrice = number(params.price)
  const yearBuilt = number(params.yb)
  const sqft = number(params.sqft)

  if (!fuel || !tier || !installYear || units === null || unitPrice === null || townRaw === '') {
    return (
      <Chrome>
        <section className="rounded-card border border-rule bg-surface p-6">
          <h1 className="text-title font-medium">The verdict needs three things.</h1>
          <p className="mt-2 max-w-[52ch] text-small text-ink-muted">
            A fuel, how much of it you burn in a year, what you pay for it, and the town. Nothing is guessed — a
            missing number would become an invented one.
          </p>
          <Link
            href="/start"
            className="mt-5 inline-block rounded-card bg-ink px-4 py-2.5 text-small font-medium text-paper"
          >
            Start with your bill
          </Link>
        </section>
      </Chrome>
    )
  }

  const prices = await getPrices({ timeoutMs: 4_000 })
  // A rate read off the household's own electric bill beats the statewide EIA
  // average — but only inside a plausible band; a misread must not move the verdict.
  const billRate = plausibleElectricRate(first(params.er))
  const standardRate = billRate ?? prices.elec.usdPerUnit
  const utilityKey = first(params.ut)
  const provenance = provenanceLine((first(params.mn) ?? '').slice(0, 160) || null, number(params.mc))
  const buildingUnits = number(params.bu)
  const changeHref = `/start?${queryString(params)}`
  const seasonal = seasonalHeatPumpRate(standardRate, townRaw)
  const utility = resolveUtility(townRaw)
  const hdd65 = hdd65ForTown(townRaw) ?? undefined

  const heating = {
    fuel,
    annualUnits: units,
    unitPrice,
    yearBuilt: yearBuilt ?? undefined,
    sqft: sqft ?? undefined,
    hdd65,
  }

  const upgrade = {
    tier,
    installYear,
    heatPumpRate: seasonal.rate,
    standardRate,
  }

  const result = computeVerdict(heating, upgrade)
  const refusal = result ? null : refusalFor(heating, upgrade)
  const meta = result ? VERDICT_META[result.verdict] : null
  // The bill's own sender settles a mixed town: a light-plant bill means no Mass Save rebate;
  // an investor-owned sender means the question is answered.
  const billSaysMunicipal = utilityKey === 'municipal'
  const billSaysInvestorOwned = ['eversource', 'national_grid', 'unitil'].includes(utilityKey ?? '')
  const noMassSave = billSaysMunicipal || utility.eligibleForMassSave === false
  const asksUtility = !billSaysMunicipal && !billSaysInvestorOwned && utility.eligibleForMassSave === null

  // ---- provenance (R9): only the page knows where a number came from, so the
  // page names the sources and the pure module does the rest.
  const asOfDay = (raw: string): string => raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? raw
  const billRead = provenance !== null
  const fuelSource: SourceRef = billRead
    ? {
        publisher: 'Your fuel document',
        document: 'The delivery receipt or bill you uploaded — the yearly use and the price per unit',
        asOf: 'as billed',
      }
    : {
        publisher: 'You',
        document: 'The yearly use and the price per unit you entered',
        asOf: 'as entered',
      }
  const electricitySource: SourceRef =
    billRate !== null
      ? {
          publisher: 'Your electric bill',
          document: 'The all-in rate read from your own bill, used instead of the statewide average',
          asOf: 'as billed',
        }
      : {
          publisher: 'U.S. Energy Information Administration',
          document: prices.mode === 'snapshot'
            ? 'Electric Power Monthly — Massachusetts residential, all-in average (dated snapshot)'
            : 'Electric Power Monthly — Massachusetts residential, all-in average',
          asOf: prices.elec.period,
        }
  const sponsorNames = utility.sponsors.map((sponsor) => SPONSOR_NAME[sponsor]).join(' / ')
  const heatPumpRateSource: SourceRef = seasonal.applied
    ? {
        publisher: `Mass Save · ${sponsorNames || 'sponsor not resolved'}`,
        document: `Seasonal heat-pump rate: standard rate ${seasonal.rule !== null && seasonal.rule < 0 ? '−' : ''}$${Math.abs(seasonal.rule ?? 0).toFixed(2)}/kWh, 1 Nov – 30 Apr`,
        asOf: electricitySource.asOf,
      }
    : {
        publisher: 'Mass Save',
        document: 'No seasonal heat-pump adjustment applies here; the standard all-in rate is used',
        asOf: electricitySource.asOf,
      }
  const county = countyOfTown(townRaw)
  const climateSource: SourceRef = {
    publisher: 'Open-Meteo — ERA5 reanalysis',
    document: `Heating degree days, base 65 °F, ${county?.name ?? 'Massachusetts'} county centroid, 2015–2024 mean`,
    asOf: asOfDay(GEO_META.hdd.fetchedAt),
  }
  const rebateRules = rulesForYear(installYear)
  const rebateSource: SourceRef = {
    publisher: 'Mass Save',
    document: rebateRules?.source ?? 'Mass Save residential heat-pump rebate table',
    asOf: asOfDay(rebateRules?.source ?? '2026-10-24'),
  }
  const installCostSource: SourceRef = {
    publisher: 'Mass Save',
    document: 'Average whole-home installation cost, installs completed 2022',
    asOf: '2026-10-24',
  }
  const equipmentSource: SourceRef = {
    publisher: 'Switchpoint, from the documented defaults',
    document: 'SCOP 2.70 · AHRI cooling-capacity sizing at 12,000 BTU per ton',
    asOf: '2026-10-24',
  }
  const provenanceContext: ProvenanceContext = {
    fuelSource,
    electricitySource,
    heatPumpRateSource,
    climateSource,
    rebateSource,
    installCostSource,
    equipmentSource,
    billNote: provenance,
  }
  const entries = result ? provenanceFor(result, provenanceContext) : []

  return (
    <Chrome>
      <ProvenanceProvider entries={entries}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={changeHref}
          className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          ← Change the numbers
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge kind={prices.mode === 'live' ? 'live' : 'snapshot'} date={prices.asOf} label="Prices" />
          {first(params.src) === 'assessor' && yearBuilt !== null ? (
            <FreshnessBadge kind="assessor" label="Year built" />
          ) : null}
          {billRate !== null ? <FreshnessBadge kind="manual" label="Electricity rate: your bill" /> : null}
        </div>
      </div>

      {result === null ? (
        <section className="mt-6 rounded-card border border-rule bg-surface p-6" role="alert">
          <h1 className="text-title font-medium">We cannot answer this one honestly.</h1>
          <p className="mt-2 max-w-[52ch] text-small text-ink-muted">
            {refusal?.message ?? 'One of the numbers is outside what this calculator will stand behind.'}
          </p>
          <Link href={changeHref} className="mt-5 inline-block text-small underline underline-offset-4">
            Try different numbers
          </Link>
        </section>
      ) : (
        <>
          {noMassSave ? (
            <section
              data-tone="hold"
              className="mt-6 rounded-card border border-rule border-l-4 border-l-(--tone) bg-(--tone-tint) p-6"
            >
              <p className="text-eyebrow uppercase text-ink-muted">A refusal, not a verdict</p>
              <h1 className="mt-2 text-headline font-medium">
                Mass Save rebates do not apply at this address.
              </h1>
              <p className="mt-3 max-w-[62ch] text-small text-ink">
                {utility.reason ??
                  'This town is served by a municipal light plant, so the Mass Save electric rebate is not available.'}
              </p>
              <p className="mt-3 max-w-[62ch] text-small text-ink-muted">
                We will show what the same heat would cost to run, because that part is true anywhere. We will not
                print a rebate, a net cost or a payback you cannot receive.
              </p>
            </section>
          ) : (
            <section
              data-tone={meta?.tone ?? 'hold'}
              className="mt-6 rounded-card border border-rule border-l-4 border-l-(--tone) bg-(--tone-tint) p-6 sm:p-8"
            >
              <p className="text-eyebrow uppercase text-ink-muted">The verdict</p>
              <h1 className="mt-2 text-display font-medium">{meta?.headline}</h1>

              <div className="mt-8 flex flex-wrap items-end gap-x-6 gap-y-2">
                {result.annualSavings > 0 ? (
                  <>
                    <p className="text-number font-medium tabular-nums tracking-[-0.03em]">
                      <Figure id="savings">{usd(result.annualSavings)}</Figure>
                    </p>
                    <p className="mb-2 max-w-[24ch] text-small text-ink-muted">
                      a year, at the seasonal heat-pump rate
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-number font-medium tabular-nums tracking-[-0.03em]">
                      <Figure id="breakEven">
                        {result.breakEvenElectricPrice === null ? '—' : cents(result.breakEvenElectricPrice)}
                      </Figure>
                    </p>
                    <p className="mb-2 max-w-[28ch] text-small text-ink-muted">
                      break-even electricity price. Above it, the heat pump costs you money.
                    </p>
                  </>
                )}
              </div>

              <p className="mt-6 text-small text-ink-muted">
                You spend{' '}
                <span className="tabular-nums text-ink">
                  <Figure id="oldCost">{usd(result.oldAnnualCost)}</Figure>
                </span>{' '}
                a year on {FUEL_LABEL[result.fuel]}. The same heat from a heat pump:{' '}
                <span className="tabular-nums text-ink">
                  <Figure id="newCostSeasonal">{usd(result.newAnnualCostHeatPumpRate)}</Figure>
                </span>{' '}
                at the seasonal rate,{' '}
                <span className="tabular-nums text-ink">
                  <Figure id="newCostStandard">{usd(result.newAnnualCostStandard)}</Figure>
                </span>{' '}
                at the standard rate.
              </p>

              {result.annualSavings <= 0 ? (
                <p className="mt-4 max-w-[62ch] border-t border-rule pt-4 text-small text-ink">
                  Neither rate saves money: {usd(result.annualSavings)} at the seasonal rate,{' '}
                  {usd(result.annualSavingsAtStandardRate)} at the standard rate. The break-even price above is
                  where this house would turn.
                </p>
              ) : result.annualSavingsAtStandardRate <= 0 ? (
                <p className="mt-4 max-w-[62ch] border-t border-rule pt-4 text-small text-ink">
                  At the standard rate this does not save money. The only view that works is the winter rate, so
                  treat {usd(result.annualSavings)} as the optimistic half of the answer.
                </p>
              ) : null}
            </section>
          )}

          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Rebate, 2026 install"
              value={noMassSave ? 'not available' : <Figure id="rebate">{usd(result.totalRebate)}</Figure>}
              note={noMassSave ? 'municipal light plant' : `2027: ${usd(result.rebate2027)}`}
              muted={noMassSave}
            />
            <Stat
              label="Net cost after rebate"
              value={noMassSave ? 'not quoted' : <Figure id="netCost">{usd(result.netCost)}</Figure>}
              note={noMassSave ? 'rebate does not exist here' : `on ${usd(result.installCost)} installed`}
              muted={noMassSave}
            />
            <Stat
              label="Payback"
              value={
                noMassSave ? (
                  'not quoted'
                ) : result.paybackYears === null ? (
                  'none'
                ) : (
                  <Figure id="payback">{`${result.paybackYears.toFixed(1)} yr`}</Figure>
                )
              }
              note={noMassSave ? 'depends on a rebate' : result.paybackYears === null ? 'no savings, no payback' : 'simple, undiscounted'}
              muted={noMassSave}
            />
            <Stat
              label="0% heat loan"
              value={noMassSave ? 'not quoted' : <Figure id="monthlyLoan">{usd(result.monthlyLoan)}</Figure>}
              note={
                noMassSave ? (
                  'the loan is not the issue'
                ) : result.cashFlowPositive ? (
                  <>
                    +<Figure id="monthlySavings">{usd(result.monthlySavings)}</Figure> a month in pocket
                  </>
                ) : (
                  <>
                    <Figure id="monthlySavings">{usd(Math.abs(result.monthlySavings))}</Figure> a month short
                  </>
                )
              }
              muted={noMassSave}
            />
          </section>

          <section className="mt-4 rounded-card border border-rule bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-small font-medium">The utility at this address</h2>
              <span className="text-micro text-ink-faint">{displayTown(townRaw)}</span>
            </div>

            {asksUtility ? (
              <p className="mt-2 max-w-[62ch] text-small text-ink">
                {utility.question ?? 'This town has more than one sponsor, so we have to ask.'} The figures above
                assume the investor-owned sponsor; if a municipal department bills you, the rebate is $0.
              </p>
            ) : (
              <p className="mt-2 text-small text-ink-muted">
                {utility.found
                  ? utility.sponsors.map((sponsor) => SPONSOR_NAME[sponsor]).join(' · ')
                  : 'Not one of the 351 municipalities.'}
                {seasonal.applied ? ' · seasonal heat-pump rate applied' : ''}
              </p>
            )}

            <dl className="mt-4 grid gap-3 border-t border-rule pt-4 text-micro sm:grid-cols-3">
              <div>
                <dt className="text-ink-faint">Climate</dt>
                <dd className="tabular-nums text-ink">
                  <Figure id="hdd">{`${result.hdd65.toLocaleString('en-US')} HDD65`}</Figure> · {result.designTempF}°F
                  design
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Sized</dt>
                <dd className="tabular-nums text-ink">
                  <Figure id="tons">{`${result.tons.toFixed(1)} tons`}</Figure> ·{' '}
                  <Figure id="designLoad">{`${Math.round(result.designBTUhr).toLocaleString('en-US')} BTU/hr`}</Figure>
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Bill used</dt>
                <dd className="tabular-nums text-ink">
                  <Figure id="fuelUse">
                    {`${result.annualUnits.toLocaleString('en-US')} ${UNIT_LABEL[result.fuel]} at $${result.unitPrice.toFixed(2)}`}
                  </Figure>{' '}
                  · <Figure id="scop">{`${result.scop} SCOP`}</Figure>
                </dd>
              </div>
            </dl>
          </section>

          <details className="mt-4 rounded-card border border-rule bg-surface p-5">
            <summary className="cursor-pointer text-small font-medium">
              The arithmetic, the defaults, and what would change the answer
            </summary>

            <dl className="mt-4 divide-y divide-rule border-y border-rule">
              {provenance ? (
                <div className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                  <dt className="text-micro text-ink-faint">Yearly {UNIT_LABEL[result.fuel] === 'kWh' ? 'electricity' : 'fuel'}</dt>
                  <dd className="text-small tabular-nums text-ink">
                    <Figure id="fuelUse">
                      {`${result.annualUnits.toLocaleString('en-US')} ${UNIT_LABEL[result.fuel]}`}
                    </Figure>
                  </dd>
                  <dd className="text-micro text-ink-muted">{provenance}</dd>
                </div>
              ) : null}
              {billRate !== null ? (
                <div className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                  <dt className="text-micro text-ink-faint">Electricity price</dt>
                  <dd className="text-small tabular-nums text-ink">${billRate.toFixed(3)}/kWh</dd>
                  <dd className="text-micro text-ink-muted">
                    Read off your electric bill, used instead of the statewide average of $
                    {prices.elec.usdPerUnit.toFixed(3)}/kWh.
                  </dd>
                </div>
              ) : null}
              {buildingUnits !== null && buildingUnits > 1 ? (
                <div className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                  <dt className="text-micro text-ink-faint">Floor area</dt>
                  <dd className="text-small tabular-nums text-ink">{sqft?.toLocaleString('en-US') ?? '—'} sqft</dd>
                  <dd className="text-micro text-ink-muted">
                    Assumption: the assessor&rsquo;s building area divided by {buildingUnits} units.
                  </dd>
                </div>
              ) : null}
              {result.assumptions.map((assumption) => (
                <div key={`${assumption.field}-${assumption.value}`} className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                  <dt className="text-micro text-ink-faint">{assumption.field}</dt>
                  <dd className="text-small tabular-nums text-ink">{assumption.value}</dd>
                  <dd className="text-micro text-ink-muted">{assumption.reason}</dd>
                </div>
              ))}
              <div className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                <dt className="text-micro text-ink-faint">Waiting until 1 Jan</dt>
                <dd className="text-small tabular-nums text-ink">
                  <Figure id="cliff">{usd(result.cliffCost)}</Figure>
                </dd>
                <dd className="text-micro text-ink-muted">
                  What the 2027 step-down costs this house, on the same tier and tonnage.
                </dd>
              </div>
            </dl>

            {result.caveats.length ? (
              <ul className="mt-4 grid gap-2 text-micro text-ink-muted">
                {result.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}

            <ul className="mt-4 grid gap-1 border-t border-rule pt-4 text-micro text-ink-faint">
              {result.rebateBreakdown.map((line) => (
                <li key={line.label} className="flex justify-between gap-4">
                  <span>
                    {line.label} <span className="text-ink-faint">· {line.source}</span>
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    <Figure id="rebate">{usd(line.amount)}</Figure>
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <p className="mt-6 max-w-[70ch] text-micro text-ink-muted">
            Prices: the {prices.mode === 'live' ? 'live' : 'dated'} reading for {prices.asOf}. The electricity
            series describes {prices.elec.period}, so treat it as a period, not as today.
          </p>
        </>
      )}
      </ProvenanceProvider>
    </Chrome>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}

function Stat({
  label,
  value,
  note,
  muted = false,
}: {
  label: string
  value: React.ReactNode
  note: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="rounded-card border border-rule bg-surface p-4">
      <p className="text-eyebrow uppercase text-ink-faint">{label}</p>
      <p className={`mt-2 text-title font-medium tabular-nums ${muted ? 'text-ink-faint' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 text-micro text-ink-muted">{note}</p>
    </div>
  )
}
