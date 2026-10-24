import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { VerdictLegend } from '@/components/verdict-legend'

/**
 * @built F-02 app shell — token-driven landing page, no network, no fake state
 *
 * This is the shell the intake lands in. It states the product, shows the three
 * verdict tones, and dates every number it prints. Nothing here computes or
 * invents a figure: the constants below are quoted from
 * `.kiro/steering/mass-save-rules.md` with their source and effective date, and
 * they will be read from `lib/prices` + `data/rules` once intake is wired.
 */

interface Fact {
  value: string
  unit?: string
  label: string
  source: string
}

const FACTS: readonly Fact[] = [
  {
    value: '$6.23',
    unit: '/ gal',
    label: 'Heating oil, Massachusetts average',
    source: 'MA DOER weekly fuel survey · week of 19 Oct 2026 · up 75% on the year',
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

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

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

            <dl className="mt-12 grid overflow-hidden rounded-card border border-rule bg-surface sm:grid-cols-3">
              {FACTS.map((fact, i) => (
                <div
                  key={fact.value}
                  className={[
                    'flex flex-col gap-2 p-5 sm:p-6',
                    i > 0 ? 'border-t border-rule sm:border-l sm:border-t-0' : '',
                  ].join(' ')}
                >
                  <dt className="text-small font-medium text-ink">{fact.label}</dt>
                  <dd className="order-first">
                    <span className="num text-title font-medium text-ink">{fact.value}</span>
                    {fact.unit ? (
                      <span className="num ml-1 text-small text-ink-faint">{fact.unit}</span>
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
