import Link from 'next/link'

import { HeroMap } from '@/components/home/hero-map'
import { CountUp } from '@/components/motion/count-up'
import { Reveal } from '@/components/motion/reveal'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { VerdictLegend } from '@/components/verdict-legend'
import { demoFromParams, withDemo } from '@/lib/demo'
import { formatDateShort } from '@/lib/freshness'
import { getPrices } from '@/lib/prices'

/**
 * @built F-02 app shell — token-driven landing page
 * @built F-140 the hero's "Create your profile" is the way in; `/start` now
 * redirects to `/onboarding`
 * @built F-14 the fuel figure and its badge are read from the price adapter, so
 * the front page cannot drift from the verdict screen's source of truth
 * @built F-49 `?demo=1` reads the baked snapshot and threads the flag into every
 * link, so one demo click does not become a live request on the next screen
 *
 * Nothing here computes or invents a figure: the oil price comes from
 * `lib/prices` with its date, and the rebate, household count and federal-credit
 * lines are quoted from `.kiro/steering/mass-save-rules.md` and the baked ACS
 * layer, each with its source on screen.
 */

export const revalidate = 86_400

const step = (i: number) => ({ '--i': i }) as React.CSSProperties

interface Fact {
  value: string
  unit?: string
  label: string
  source: string
  countUp?: boolean
}

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams
  const demo = demoFromParams(params)
  const prices = await getPrices({ timeoutMs: 4_000, demo })

  const facts: readonly Fact[] = [
    {
      value: `$${prices.oil.usdPerUnit.toFixed(2)}`,
      unit: '/ gal',
      label: 'Heating oil, Massachusetts average',
      source: `MA DOER weekly fuel survey · ${formatDateShort(prices.oil.period) ?? prices.oil.period} · ${prices.mode === 'live' ? 'live reading' : 'dated snapshot'}`,
    },
    {
      value: '$2,650 → $2,350',
      unit: '/ ton',
      label: 'Whole-home heat pump rebate, per ton',
      source: 'Mass Save · installs on or after 1 Jan 2027 · cap falls $8,500 → $7,500',
    },
    {
      value: '624,510',
      unit: 'homes',
      label: 'Massachusetts households heating with oil',
      countUp: true,
      source:
        '22.4% of 2,785,042 occupied units · ACS 5-year B25040, baked statewide from 1,620 tracts · ≈$2.9B a winter at 750 gal each',
    },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} quietAtTop />

      <main id="main" className="flex-1">
        <section className="relative isolate -mt-14 flex min-h-[min(40rem,88dvh)] items-center overflow-hidden bg-paper sm:-mt-16">
          <HeroMap />
          <div className="relative mx-auto w-full max-w-[1180px] px-5 pb-20 pt-32 sm:px-8 sm:pb-28 sm:pt-36">
            <h1
              className="rise max-w-[15ch] text-balance text-display font-medium"
              style={step(0)}
            >
              The honest heat pump verdict for Massachusetts.
            </h1>

            <p className="rise mt-6 max-w-[44ch] text-lede text-ink-muted" style={step(1)}>
              Two bills in, one answer out: switch, switch before 31 December, or leave it
              alone. When the numbers do not work, it says so.
            </p>

            <div className="rise mt-9" style={step(2)}>
              <Link
                href={withDemo('/onboarding', demo)}
                className="group inline-flex items-center gap-3 rounded-pill bg-ink px-6 py-3.5 text-small font-medium text-paper shadow-[0_14px_34px_-16px_rgba(0,0,0,0.55)] transition-[translate,scale,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-16px_rgba(0,0,0,0.6)] active:scale-[0.97]"
              >
                Create your profile
                <span
                  aria-hidden
                  className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            </div>
            {demo ? (
              <p className="mt-4 max-w-[58ch] text-micro text-ink-muted">
                <span className="font-medium text-ink">Demo mode.</span> Prices and explanations come from
                baked data; address, parcel and bill reading fall back to manual entry.
              </p>
            ) : null}
          </div>
        </section>

        <section className="band-wash border-y border-rule">
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
            <Reveal>
              <dl className="glass grid overflow-hidden rounded-card border border-rule shadow-soft sm:grid-cols-3">
                {facts.map((fact, i) => (
                  <div
                    key={fact.value}
                    className={[
                      'flex flex-col gap-2 p-5 sm:p-7',
                      i > 0 ? 'border-t border-rule sm:border-l sm:border-t-0' : '',
                    ].join(' ')}
                  >
                    <dt className="text-small font-medium text-ink">{fact.label}</dt>
                    <dd className="order-first">
                      {fact.countUp ? (
                        <CountUp
                          value={fact.value}
                          delayMs={400}
                          className="text-title font-medium tracking-[-0.01em] text-ink"
                        />
                      ) : (
                        <span className="text-title font-medium tabular-nums tracking-[-0.01em] text-ink">
                          {fact.value}
                        </span>
                      )}
                      {fact.unit ? (
                        <span className="ml-1.5 text-small text-ink-faint">{fact.unit}</span>
                      ) : null}
                    </dd>
                    <dd className="text-micro text-ink-muted">{fact.source}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
                <h2 className="max-w-[18ch] text-balance text-headline font-medium">
                  Three answers. One of them is no.
                </h2>
                <p className="max-w-[40ch] text-small text-ink-muted">
                  Rebates are paid by the utility serving the address, and municipal light plant
                  towns are not eligible at all. Switchpoint resolves the sponsor before it prints a
                  dollar figure.
                </p>
              </div>
            </Reveal>

            <Reveal index={1} className="lift-cards">
              <VerdictLegend className="mt-12" />
            </Reveal>
          </div>
        </section>

        <section className="band-wash border-t border-rule">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[1fr_1.2fr]">
            <Reveal>
              <h2 className="max-w-[16ch] text-balance text-headline font-medium">
                Every figure carries its source.
              </h2>
              <p className="mt-4 max-w-[40ch] text-small text-ink-muted">
                Any number on screen expands to the formula, its inputs and the day the source
                published them. When a source is missing, the screen says
                <span className="text-ink"> verify</span> instead of guessing.
              </p>
            </Reveal>

            <dl className="divide-y divide-rule border-y border-rule">
              <SourceRow
                index={1}
                term="Fuel and electricity prices"
                detail="EIA API v2, with the MA DOER weekly survey as the dated fallback. When the live call fails the badge reads snapshot, with the date."
              />
              <SourceRow
                index={2}
                term="Rebate rules"
                detail="Mass Save program documents, encoded as versioned JSON for 2026 and 2027 and property-tested so a wrong tier cannot reach the screen."
              />
              <SourceRow
                index={3}
                term="Houses and utilities"
                detail="MassGIS Level 3 parcels for year built, Electricity Providers for the sponsor, Census ACS for the tract."
              />
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function SourceRow({ term, detail, index }: { term: string; detail: string; index: number }) {
  return (
    <Reveal index={index} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6">
      <dt className="text-small font-medium text-ink">{term}</dt>
      <dd className="text-small text-ink-muted">{detail}</dd>
    </Reveal>
  )
}
