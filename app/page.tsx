import Link from 'next/link'

import { FreshnessBadge } from '@/components/freshness-badge'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DemoPresets } from '@/components/verdict/demo-presets'
import { VerdictLegend } from '@/components/verdict-legend'
import { demoFromParams, withDemo } from '@/lib/demo'
import { formatDateShort } from '@/lib/freshness'
import { getPrices } from '@/lib/prices'

/**
 * @built F-02 app shell — token-driven landing page
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

interface Fact {
  value: string
  unit?: string
  label: string
  source: string
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
      source:
        '22.4% of 2,785,042 occupied units · ACS 5-year B25040, baked statewide from 1,620 tracts · ≈$2.9B a winter at 750 gal each',
    },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} />

      <main id="main" className="flex-1">
        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-24">
            <p className="text-eyebrow uppercase text-ink-muted">
              Hackachusetts 2026 · Climate Tech · Challenge C2
            </p>

            <h1 className="mt-6 max-w-[20ch] text-balance text-display font-medium">
              The honest heat pump verdict for Massachusetts.
            </h1>

            <p className="mt-6 max-w-[58ch] text-lede text-ink-muted">
              624,510 households here heat with oil — about $2.9 billion a winter. Give
              Switchpoint an address and a heating bill and it answers one question — switch,
              switch before 31 December, or leave it alone. When the numbers do not work, it
              says so and prints the break-even electricity price instead.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={withDemo('/onboarding', demo)}
                className="group inline-flex items-center gap-3 rounded-pill bg-ink px-5 py-3 text-small font-medium text-paper transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]"
              >
                Create your profile
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              <Link
                href={withDemo('/start', demo)}
                className="rounded-card border border-rule-strong bg-surface px-5 py-3 text-small font-medium text-ink transition-colors hover:border-ink"
              >
                Try it without an account
              </Link>
              <FreshnessBadge
                kind={prices.mode === 'live' ? 'live' : 'snapshot'}
                date={prices.asOf}
                label="Fuel prices"
              />
            </div>
            {demo ? (
              <p className="mt-3 max-w-[58ch] text-micro text-ink-muted">
                <span className="font-medium text-ink">Demo mode.</span> Prices, explanations and provider
                statuses come from baked data; address, parcel and bill reading fall back to manual entry. The
                links keep <code className="font-mono text-[11px]">?demo=1</code> so the next screen stays
                offline too.
              </p>
            ) : null}
            <p className="mt-3 max-w-[58ch] text-micro text-ink-muted">
              A profile takes four steps and about two minutes: your name and email, one photo of a bill, your town,
              then the verdict. The profile stays in this browser; the bill image is never stored.
            </p>

            <dl className="mt-12 grid overflow-hidden rounded-card border border-rule bg-surface sm:grid-cols-3">
              {facts.map((fact, i) => (
                <div
                  key={fact.value}
                  className={[
                    'flex flex-col gap-2 p-5 sm:p-6',
                    i > 0 ? 'border-t border-rule sm:border-l sm:border-t-0' : '',
                  ].join(' ')}
                >
                  <dt className="text-small font-medium text-ink">{fact.label}</dt>
                  <dd className="order-first">
                    <span className="text-title font-medium tabular-nums tracking-[-0.01em] text-ink">
                      {fact.value}
                    </span>
                    {fact.unit ? (
                      <span className="ml-1.5 text-small text-ink-faint">{fact.unit}</span>
                    ) : null}
                  </dd>
                  <dd className="text-micro text-ink-muted">{fact.source}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 max-w-[70ch] text-micro text-ink-muted">
              The federal 25C heat pump credit expired on 31 December 2025. It is worth $0 on a
              2026 install, and any calculator still counting it is quoting you money that no
              longer exists.
            </p>
          </div>
        </section>

        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
            <DemoPresets />
          </div>
        </section>

        <section className="border-b border-rule bg-paper-sunk">
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-headline font-medium">Three answers. One of them is no.</h2>
              <p className="text-micro text-ink-muted">
                The verdict palette — switch, deadline, hold
              </p>
            </div>

            <VerdictLegend className="mt-8" />

            <p className="mt-8 max-w-[62ch] text-small text-ink-muted">
              Mass Save rebates are paid by the utility sponsor serving the address, and
              municipal light plant towns — Wellesley, Belmont, Holyoke and dozens more — are not
              eligible for Mass Save electric rebates at all. Switchpoint resolves the sponsor
              before it prints a dollar figure.
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 sm:px-8 sm:py-20 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-title font-medium">Every figure carries its source and its date.</h2>
              <p className="mt-3 max-w-[42ch] text-small text-ink-muted">
                Any number on screen expands to the formula, the values that went into it, and
                the day the source published them. If a source is missing, the screen says
                <span className="text-ink"> verify</span> rather than guessing.
              </p>
            </div>

            <dl className="divide-y divide-rule border-y border-rule">
              <SourceRow
                term="Fuel and electricity prices"
                detail="EIA API v2, with the MA DOER weekly survey as the dated fallback. When the live call fails the badge reads snapshot, with the date."
              />
              <SourceRow
                term="Rebate rules"
                detail="Mass Save program documents, encoded as versioned JSON — 2026 and 2027 — and property-tested so a wrong tier cannot reach the screen."
              />
              <SourceRow
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

function SourceRow({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6">
      <dt className="text-small font-medium text-ink">{term}</dt>
      <dd className="text-small text-ink-muted">{detail}</dd>
    </div>
  )
}
