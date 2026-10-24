import type { Metadata } from 'next'
import Link from 'next/link'

import { FreshnessBadge } from '@/components/freshness-badge'
import { InstallCostField } from '@/components/install-cost-field'
import { RebateStack } from '@/components/rebate-stack'
import { RecommendationCard } from '@/components/verdict/recommendation-card'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { AssumptionsStrip } from '@/components/verdict/assumptions-strip'
import { CashFlow } from '@/components/verdict/cash-flow'
import { EnhancedOfferLine } from '@/components/verdict/enhanced-offer'
import { NumberFlip } from '@/components/verdict/number-flip'
import { PlainSummary } from '@/components/verdict/plain-summary'
import { ProvenanceFigure } from '@/components/verdict/provenance-figure'
import { VerdictDial } from '@/components/verdict/verdict-dial'
import { computeVerdict, refusalFor } from '@/lib/calc'
import type { Fuel } from '@/lib/calc/types'
import { formatDateShort } from '@/lib/freshness'
import { GEO_META, countyOfTown, displayTown } from '@/lib/geo'
import { provenanceLine, queryString } from '@/lib/intake/params'
import { demoFromParams } from '@/lib/demo'
import { getPrices } from '@/lib/prices'
import { buildSwitchModel } from '@/lib/switch/model'
import { buildOptionInput } from '@/lib/switch/option-input'
import { loadProviders, outreachPlan } from '@/lib/switch/providers'
import { recommend } from '@/lib/verdict/recommendation'
import { verdictPath } from '@/lib/verdict/share-query'
import { SPONSOR_NAME } from '@/lib/utility'
import { enhancedOffer } from '@/lib/verdict/enhanced-offer'
import { isVerdictQueryComplete, resolveVerdictInputs } from '@/lib/verdict/inputs'
import { entryFor, provenanceFor, type FigureId, type ProvenanceEntry } from '@/lib/verdict/provenance'
import { verdictHeadline, type Part } from '@/lib/verdict/headline'
import { MIN_REASONS, verdictNotes } from '@/lib/verdict-notes'
import { VERDICT_META } from '@/lib/verdicts'

/**
 * @built F-106 round-trip + provenance: the change link carries the whole query; the bill's
 * method, note and confidence, and a household electricity rate (`er`), show up here
 * @built F-32 verdict screen shell — one number, big, unmissable
 * @built F-33 the old fuel cost turns into the heat-pump cost in 900ms, motion optional
 * @built F-34 the dial — three states, icon + label + colour, the active one marked
 * @built F-35 the install year defaults to today (R5.1), the +$500 bonuses arrive from
 * the query, and the rebate stack gets a quote so the enhanced tier can be priced
 * @built F-36 every headline figure is a button that opens its formula, values and source date
 * @built F-37 the 0% HEAT Loan payment sits beside the monthly saving, either way
 * @built F-38 the defaults and the disclaimer are on the page before any fold
 * @built F-57 the utility badge, and the plain refusal when a municipal light plant
 * means there is no Mass Save electric rebate to quote
 * @built F-39 three sentences of plain English, written from these numbers and checked against them
 * @built F-152 R8.3 — two reasons and one caveat are floored by `verdictNotes`, not sliced off a raw array
 * @built F-153 R7.2 — the installed cost is editable here and on the form, badged with
 * where the number came from, and carried in the link so the verdict recomputes in place
 * @built F-50 R14.4 — `plainSummary` puts the answer and the two costs beside the dial in
 * short sentences, rendered on the server, so the plain-language layer needs no API
 * @built F-50 R14.3 — the enhanced path is a visible line with a link whenever the fuel is
 * eligible and the household is not already on the enhanced tier
 * @built F-50 R14.1/R14.2/R15.2 — the verdict tone is never the only signal, every figure
 * is a button, and the disclaimer is the exact sentence from `lib/verdict/disclaimer`
 *
 * Server-rendered from the URL and `lib/calc`. No client JavaScript is needed to
 * see the answer, no API route is required to produce it, and the same link
 * recomputes the same number tomorrow at tomorrow's prices, with the date on
 * screen. The dial, the flip and the drawer are
 * client-side enhancements of a page that already works without them.
 *
 * The municipal-light-plant gate is applied here in its minimal honest form: if
 * the town is served by a municipal department, Mass Save electric rebates do not
 * exist for this address, so the screen refuses to print a rebate-adjusted
 * payback at all. Full refusal state and copy land with F-57.
 */


const usd = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

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

  if (!isVerdictQueryComplete(params)) {
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

  // R13.1: a demo verdict must not read EIA even when a key is present.
  const prices = await getPrices({ timeoutMs: 4_000, demo: demoFromParams(params) })
  const inputs = resolveVerdictInputs(params, prices)
  const { fuel, tier, town: townRaw, yearBuilt, quote, income, billUtility, billRate, seasonal, utility, installYear, sqft } = inputs
  const { heating, upgrade } = inputs
  if (!heating || !upgrade || !fuel || !tier || !installYear) throw new Error('verdict inputs incomplete after the completeness check')

  const provenance = provenanceLine((first(params.mn) ?? '').slice(0, 160) || null, number(params.mc))
  const buildingUnits = number(params.bu)
  const changeHref = `/start?${queryString(params)}`

  const result = computeVerdict(heating, upgrade)
  const refusal = result ? null : refusalFor(heating, upgrade)
  const meta = result ? VERDICT_META[result.verdict] : null
  // R8.3: the page never slices the raw arrays. `verdictNotes` floors any result
  // at two reasons and one caveat, deduplicated, without inventing a number.
  const notes = result ? verdictNotes(result) : null
  // The bill's own sender settles a mixed town: a light-plant bill means no Mass Save rebate;
  // an investor-owned sender means the question is answered.
  const billSaysMunicipal = billUtility === 'municipal'
  const billSaysInvestorOwned = billUtility === 'eversource' || billUtility === 'national_grid' || billUtility === 'unitil'
  const noMassSave = billSaysMunicipal || utility.eligibleForMassSave === false
  const asksUtility = !billSaysMunicipal && !billSaysInvestorOwned && utility.eligibleForMassSave === null
  // R14.3: the income-qualified tier is offered in place when the rebate table says
  // this fuel can claim it and the household is not on it. `noMassSave` suppresses it:
  // there is no Mass Save award to qualify for at a municipal light plant.
  const offer = result === null ? null : enhancedOffer(result, params, { noMassSave })

  // ---- provenance: where each visible figure came from (F-36, R9) ----------
  // The page is the only layer that knows whether a price is live, dated, or the
  // household's own document, so it builds the source references and `lib/verdict`
  // does the arithmetic-shaped prose. Nothing here invents a number.
  const county = countyOfTown(townRaw)
  const fuelSource =
    fuel === 'oil'
      ? {
          publisher: 'Mass. Department of Energy Resources',
          document: 'Weekly heating-fuel survey',
          asOf: formatDateShort(prices.oil.period) ?? prices.oil.period,
        }
      : fuel === 'propane'
        ? {
            publisher: 'Mass. Department of Energy Resources',
            document: 'Weekly heating-fuel survey',
            asOf: formatDateShort(prices.propane.period) ?? prices.propane.period,
          }
        : {
            publisher: 'This household',
            document: 'The numbers you entered, or your own bill',
            asOf: 'as entered',
          }

  const electricitySource =
    billRate !== null
      ? { publisher: 'This household', document: 'Your electric bill', asOf: 'as entered' }
      : {
          publisher: 'US Energy Information Administration',
          document: prices.elec.label,
          asOf: formatDateShort(prices.elec.period) ?? prices.elec.period,
        }

  const sponsorLabel = utility.sponsors.length
    ? utility.sponsors.map((sponsor) => SPONSOR_NAME[sponsor]).join(' · ')
    : 'your sponsor'

  const provenanceContext = {
    fuelSource,
    electricitySource,
    heatPumpRateSource: seasonal.applied
      ? {
          publisher: 'Mass Save',
          document: `Seasonal heat-pump rate adjustment (${sponsorLabel})`,
          asOf: '2026 programme year',
        }
      : electricitySource,
    climateSource: {
      publisher: 'Open-Meteo',
      document: `ERA5 reanalysis at the ${county?.name ?? 'county'} county centroid`,
      asOf: formatDateShort(GEO_META.hdd.fetchedAt) ?? GEO_META.hdd.fetchedAt,
    },
    rebateSource: {
      publisher: 'Mass Save',
      document: `Residential heat-pump rebates, ${installYear} table`,
      asOf: 'read 24 Oct 2026',
    },
    installCostSource:
      quote === null
        ? {
            publisher: 'Mass Save',
            document: 'Program-average installed cost',
            asOf: '2026 programme year',
          }
        : { publisher: 'This household', document: 'Your contractor quote', asOf: 'as entered' },
    equipmentSource: {
      publisher: 'Mass Save',
      document: 'Air-source heat-pump specification (design assumption)',
      asOf: '2026 programme year',
    },
    billNote: provenance,
  }

  const entries = result ? provenanceFor(result, provenanceContext) : []
  const headline = result ? verdictHeadline(result) : null
  const extraReasons =
    headline && notes ? notes.reasons.slice(0, Math.max(0, MIN_REASONS - headline.parts.why.length)) : []
  const townName = displayTown(townRaw)
  const demo = demoFromParams(params)
  const mapHref = `/map?${new URLSearchParams({
    town: townName,
    next: '1',
    fuel,
    save: String(Math.round(result?.annualSavings ?? 0)),
    back: verdictPath(queryString(params)),
  }).toString()}`
  const providers = loadProviders()
  const switchModel = buildSwitchModel(params, prices)
  const optionInput = buildOptionInput(switchModel, providers, outreachPlan(providers))
  const recommendation = optionInput
    ? recommend({ option: optionInput, choices: switchModel.choices, query: queryString(params) })
    : null
  const figure = (id: FigureId): ProvenanceEntry | null => entryFor(entries, id)

  return (
    <Chrome>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={changeHref}
          className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
        >
          ← Change the numbers
        </Link>
        {first(params.src) === 'assessor' && yearBuilt !== null ? (
          <FreshnessBadge kind="assessor" label="Year built" />
        ) : null}
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
          ) : headline === null ? null : (
            <section
              data-tone={meta?.tone ?? 'hold'}
              className="mt-6 rounded-card border border-rule border-l-4 border-l-(--tone) bg-(--tone-tint) p-6 sm:p-8"
            >
              <div className="mt-2 grid gap-6 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-end">
                <div>
                  <p className="text-eyebrow uppercase text-ink-muted">The answer</p>
                  <h1 className="mt-2 max-w-[22ch] text-display font-medium">
                    <Parts entries={entries} parts={headline.parts.sentence} />
                  </h1>
                  {headline.parts.monthly.length ? (
                    <p className="mt-2 text-small tabular-nums text-ink-muted">
                      <Parts entries={entries} parts={headline.parts.monthly} />
                    </p>
                  ) : null}
                  <p className="mt-4 text-title font-medium text-(--tone)">{headline.action}</p>
                </div>
                <VerdictDial verdict={result.verdict} className="w-full" />
              </div>

              <PlainSummary result={result} />

              <ul className="mt-6 grid gap-2 border-t border-rule pt-4 text-small text-ink">
                {headline.parts.why.map((line, index) => (
                  <li key={`${headline.case}-${index}`}>
                    <Parts entries={entries} parts={line} />
                  </li>
                ))}
                {extraReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {notes?.caveats[0] ? (
                <p className="mt-3 text-micro text-ink-muted">
                  <span className="font-medium text-ink">What could change it: </span>
                  {notes.caveats[0]}
                </p>
              ) : null}

              {headline.parts.hedge.length ? (
                <p className="mt-3 text-micro text-ink-muted">
                  <Parts entries={entries} parts={headline.parts.hedge} />
                </p>
              ) : null}

              {/* R14.3: offered where it is true, with the cap read from the rebate table. */}
              {offer ? <EnhancedOfferLine offer={offer} /> : null}

              {result.annualSavings > 0 && result.annualSavingsAtStandardRate <= 0 ? (
                <p className="mt-4 max-w-[62ch] border-t border-rule pt-4 text-small text-ink">
                  At the standard rate this does not save money. The only view that works is the winter rate, so
                  treat{' '}
                  <Figure entries={entries} id="savings">
                    {usd(result.annualSavings)}
                  </Figure>{' '}
                  as the optimistic half of the answer.
                </p>
              ) : null}

              <div className="mt-6 border-t border-rule pt-4">
                <p className="text-eyebrow uppercase text-ink-faint">Heating cost a year, before and after</p>
                <NumberFlip
                  className="[&_.text-number]:text-[2rem]"
                  from={usd(result.oldAnnualCost)}
                  to={usd(result.newAnnualCostHeatPumpRate)}
                  fromLabel={`${FUEL_LABEL[result.fuel]} today`}
                  toLabel="Heat pump, seasonal rate"
                />
              </div>
            </section>
          )}

          {/* @built F-151 the verdict hands the whole query to the switch flow, so the household's claim survives the next screen */}
          {recommendation ? (
            <div className="mt-6">
              <RecommendationCard
                recommendation={recommendation}
                demo={demo}
                mapHref={mapHref}
                mapLabel={`See ${townName} on the map →`}
              />
            </div>
          ) : null}

          <h2 className="mt-10 text-title font-medium">The money</h2>
          <section className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label={`Rebate, ${result.installYear} install`}
              value={noMassSave ? 'not available' : usd(result.totalRebate)}
              note={noMassSave ? 'municipal light plant' : `2027: ${usd(result.rebate2027)}`}
              muted={noMassSave}
              entry={noMassSave ? null : figure('rebate')}
            />
            <Stat
              label="Net cost after rebate"
              value={noMassSave ? 'not quoted' : usd(result.netCost)}
              note={noMassSave ? 'rebate does not exist here' : `on ${usd(result.installCost)} installed`}
              muted={noMassSave}
              entry={noMassSave ? null : figure('netCost')}
            />
            <Stat
              label="Payback"
              value={noMassSave ? 'not quoted' : result.paybackYears === null ? 'none' : `${result.paybackYears.toFixed(1)} yr`}
              note={noMassSave ? 'depends on a rebate' : result.paybackYears === null ? 'no savings, no payback' : 'simple, undiscounted'}
              muted={noMassSave}
              entry={noMassSave ? null : figure('payback')}
            />
          </section>

          {noMassSave ? null : (
            <section className="mt-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
              <h3 className="text-small font-medium">What the install costs</h3>
              <p className="mt-1 max-w-[62ch] text-micro text-ink-muted">
                The rebate is subtracted from this number, so a quote changes the net cost, the payback and the
                loan. It never changes the answer&rsquo;s honesty.
              </p>
              <div className="mt-4">
                <InstallCostField value={result.installCost} fromQuote={quote !== null} query={queryString(params)} />
              </div>
            </section>
          )}

          <CashFlow result={result} noMassSave={noMassSave} />

          <section className="mt-10">
            <h2 className="text-title font-medium">How we worked it out</h2>
            <AssumptionsStrip result={result} />
            <details className="mt-3 rounded-card border border-rule bg-surface p-5">
              <summary className="cursor-pointer text-small font-medium">
                Rebate stack, utility and arithmetic
              </summary>
              <div className="mt-4">
                <RebateStack
                  result={result}
                  fuel={fuel}
                  income={income}
                  params={params}
                  noMassSave={noMassSave}
                />

                <section className="mt-4 rounded-card border border-rule bg-surface p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-small font-medium">The utility at this address</h3>
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
                        <Figure entries={entries} id="hdd">
                          {result.hdd65.toLocaleString('en-US')} HDD65
                        </Figure>{' '}
                        · {result.designTempF}°F design
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Sized</dt>
                      <dd className="tabular-nums text-ink">
                        <Figure entries={entries} id="tons">
                          {result.tons.toFixed(1)} tons
                        </Figure>{' '}
                        · {Math.round(result.designBTUhr).toLocaleString('en-US')} BTU/hr
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Bill used</dt>
                      <dd className="tabular-nums text-ink">
                        <Figure entries={entries} id="fuelUse">
                          {result.annualUnits.toLocaleString('en-US')} {UNIT_LABEL[result.fuel]}
                        </Figure>{' '}
                        at ${result.unitPrice.toFixed(2)} ·{' '}
                        <Figure entries={entries} id="scop">
                          {result.scop} SCOP
                        </Figure>
                      </dd>
                    </div>
                  </dl>
                </section>

                <div className="mt-4 rounded-card border border-rule bg-surface p-5">
                  <h3 className="text-small font-medium">
                    The arithmetic, the defaults, and what would change the answer
                  </h3>

                  <dl className="mt-4 divide-y divide-rule border-y border-rule">
                    {provenance ? (
                      <div className="grid gap-1 py-3 sm:grid-cols-[10rem_8rem_1fr] sm:gap-4">
                        <dt className="text-micro text-ink-faint">Yearly {UNIT_LABEL[result.fuel] === 'kWh' ? 'electricity' : 'fuel'}</dt>
                        <dd className="text-small tabular-nums text-ink">
                          {result.annualUnits.toLocaleString('en-US')} {UNIT_LABEL[result.fuel]}
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
                  </dl>

                  {result.caveats.length ? (
                    <ul className="mt-4 grid gap-2 text-micro text-ink-muted">
                      {result.caveats.map((caveat) => (
                        <li key={caveat}>{caveat}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

              </div>
            </details>
          </section>

          <p className="mt-6 max-w-[70ch] text-micro text-ink-muted">
            Prices: the {prices.mode === 'live' ? 'live' : 'dated'} reading for {prices.asOf}. The electricity
            series describes {prices.elec.period}, so treat it as a period, not as today.
          </p>
        </>
      )}
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

function Figure({
  entries,
  id,
  children,
}: {
  entries: readonly ProvenanceEntry[]
  id: FigureId
  children: React.ReactNode
}) {
  const entry = entryFor(entries, id)
  return entry ? <ProvenanceFigure entry={entry}>{children}</ProvenanceFigure> : <>{children}</>
}

function Parts({ entries, parts }: { entries: readonly ProvenanceEntry[]; parts: readonly Part[] }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Figure key={`${part.id}-${index}`} entries={entries} id={part.id}>
            {part.text}
          </Figure>
        ),
      )}
    </>
  )
}

function Stat({
  label,
  value,
  note,
  muted = false,
  entry = null,
}: {
  label: string
  value: string
  note: string
  muted?: boolean
  entry?: ProvenanceEntry | null
}) {
  return (
    <div className="rounded-card border border-rule bg-surface p-4">
      <p className="text-eyebrow uppercase text-ink-faint">{label}</p>
      <p className={`mt-2 text-title font-medium tabular-nums ${muted ? 'text-ink-faint' : 'text-ink'}`}>
        {entry ? <ProvenanceFigure entry={entry}>{value}</ProvenanceFigure> : value}
      </p>
      <p className="mt-1 text-micro text-ink-muted">{note}</p>
    </div>
  )
}
