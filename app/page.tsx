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
 *
 * The page is ordered the way a stranger reads it, not the way the app is built:
 * what this is and what it costs to try (hero), why now (dated facts), what the
 * three answers are, how two bills become one answer, what happens after, why the
 * numbers can be trusted, and the objections. Every claim below is one the
 * product already keeps — the rebate figures come from the same versioned table
 * the verdict reads, and no sentence promises eligibility, approval or a saving.
 */

export const revalidate = 86_400

const step = (i: number) => ({ '--i': i }) as React.CSSProperties

const primaryCta =
  'group inline-flex items-center gap-3 rounded-pill bg-ink px-6 py-3.5 text-small font-medium text-paper shadow-[0_14px_34px_-16px_rgba(0,0,0,0.55)] transition-[translate,scale,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-16px_rgba(0,0,0,0.6)] active:scale-[0.97]'

const secondaryCta =
  'inline-flex items-center gap-2 rounded-pill border border-rule-strong px-5 py-3 text-small font-medium text-ink transition-[border-color,scale] duration-200 ease-out-expo hover:border-ink active:scale-[0.97]'

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
      label: 'Heating oil, Massachusetts average this week',
      source: `MA DOER weekly fuel survey · ${formatDateShort(prices.oil.period) ?? prices.oil.period} · ${prices.mode === 'live' ? 'live reading' : 'dated snapshot'}`,
    },
    {
      value: '$2,650 → $2,350',
      unit: '/ ton',
      label: 'Mass Save’s whole-home rebate, before and after 1 January',
      source: 'Mass Save · installs on or after 1 Jan 2027 · cap falls $8,500 → $7,500',
    },
    {
      value: '624,510',
      unit: 'homes',
      label: 'Massachusetts households still heating with oil',
      countUp: true,
      source:
        '22.4% of 2,785,042 occupied units · ACS 5-year B25040, baked statewide from 1,620 tracts · ≈$2.9B a winter at 750 gal each',
    },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} quietAtTop />

      <main id="main" className="flex-1">
        <section className="relative isolate -mt-14 flex min-h-[min(42rem,92dvh)] items-center overflow-hidden bg-paper sm:-mt-16">
          <HeroMap />
          <div className="relative mx-auto w-full max-w-[1180px] px-5 pb-20 pt-32 sm:px-8 sm:pb-24 sm:pt-36">
            <p className="rise text-eyebrow uppercase text-ink-muted" style={step(0)}>
              The honest heat pump verdict for Massachusetts
            </p>

            <h1
              className="rise mt-5 max-w-[16ch] text-balance text-display font-medium"
              style={step(1)}
            >
              Should you switch? Two bills will tell you.
            </h1>

            <p className="rise mt-6 max-w-[46ch] text-lede text-ink-muted" style={step(2)}>
              Your heating bill and your electric bill. In about two minutes Switchpoint answers the
              question for your actual house: switch now, switch before 31 December, or leave it
              alone — and if the answer is no, it shows you the electricity price that would change
              it.
            </p>

            <div className="rise mt-9 flex flex-wrap items-center gap-3" style={step(3)}>
              <Link href={withDemo('/onboarding', demo)} className={primaryCta}>
                Get my verdict
                <span
                  aria-hidden
                  className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
              <a href="#how" className={secondaryCta}>
                See how it works
              </a>
            </div>

            <p className="rise mt-5 max-w-[58ch] text-micro text-ink-muted" style={step(4)}>
              Free · no account · your bill photo is read once and discarded · oil, propane, gas and
              electric baseboard, in all 351 Massachusetts towns
            </p>

            <div
              data-tone="deadline"
              className="rise mt-6 max-w-[56ch] border-l-2 border-l-(--tone) pl-4 text-small text-ink-muted"
              style={step(4)}
            >
              <span className="font-medium text-ink">The deadline is real.</span> The whole-home
              rebate drops from $2,650 to $2,350 a ton on 1 January — up to $1,000 less for the same
              system, installed a few weeks later.
            </div>

            {demo ? (
              <p className="mt-4 max-w-[58ch] text-micro text-ink-muted">
                <span className="font-medium text-ink">Demo mode.</span> Prices and explanations come
                from baked data; address, parcel and bill reading fall back to manual entry.
              </p>
            ) : null}
          </div>
        </section>

        <section className="band-wash border-y border-rule">
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
            <Reveal>
              <p className="text-eyebrow uppercase text-ink-muted">Why now</p>
              <h2 className="mt-4 max-w-[24ch] text-balance text-headline font-medium">
                Three numbers that decide this winter.
              </h2>
              <p className="mt-3 max-w-[52ch] text-small text-ink-muted">
                Read live, dated, and on screen with their source. If a reading fails, the badge says
                snapshot and carries the date it was taken.
              </p>
            </Reveal>

            <Reveal index={1}>
              <dl className="glass mt-8 grid overflow-hidden rounded-card border border-rule shadow-soft sm:grid-cols-3">
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
                <div>
                  <p className="text-eyebrow uppercase text-ink-muted">One answer, not a range</p>
                  <h2 className="mt-4 max-w-[18ch] text-balance text-headline font-medium">
                    Three answers. One of them is no.
                  </h2>
                </div>
                <p className="max-w-[42ch] text-small text-ink-muted">
                  Rebates come from the utility that serves your address, and municipal light plant
                  towns are not eligible at all. Switchpoint settles that before it prints a dollar
                  figure — and “no” comes with the electricity price that would flip it.
                </p>
              </div>
            </Reveal>

            <Reveal index={1} className="lift-cards">
              <VerdictLegend className="mt-12" />
            </Reveal>
          </div>
        </section>

        <section id="how" className="band-wash scroll-mt-20 border-y border-rule">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
            <Reveal>
              <p className="text-eyebrow uppercase text-ink-muted">How it works</p>
              <h2 className="mt-4 max-w-[22ch] text-balance text-headline font-medium">
                Two bills in. One answer out. Nothing to sign up for.
              </h2>
              <p className="mt-3 max-w-[54ch] text-small text-ink-muted">
                The first screen asks what to call you and an email. No password, and both stay in this
                browser — then it gets to the bills.
              </p>
            </Reveal>

            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  title: 'Point it at your house',
                  detail:
                    'Your address fills in the town, the year the house was built and the utility that supplies it — the one that decides whether a rebate exists at all.',
                },
                {
                  title: 'Hand it two bills',
                  detail:
                    'A photo of an oil delivery ticket and an electric bill, or two numbers typed in. The image is read once, turned into editable fields, then discarded.',
                },
                {
                  title: 'Read your answer',
                  detail:
                    'Switch now, switch before 31 December, or don’t switch yet. Every figure opens to its formula, its inputs and the day the source published them.',
                },
              ].map((entry, i) => (
                <Reveal key={entry.title} index={i} className="border-t border-rule-strong pt-5">
                  <span className="num text-micro text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-title font-medium text-ink">{entry.title}</h3>
                  <p className="mt-2 max-w-[38ch] text-small text-ink-muted">{entry.detail}</p>
                </Reveal>
              ))}
            </ol>

            <Reveal index={3} className="mt-14 grid gap-4 border-t border-rule pt-10 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-12">
              <h3 className="max-w-[20ch] text-balance text-title font-medium">
                Then you decide — nothing is preselected.
              </h3>
              <div className="max-w-[62ch] text-small text-ink-muted">
                <p>
                  Stay as you are, compare heating-fuel dealer prices, compare your electricity supply
                  against Basic Service, or ask installers for a ballpark. The screen offers only the
                  ones that exist at your address: a municipal light plant town is told plainly that
                  there is no supply to shop.
                </p>
                <p className="mt-3">
                  Want quotes? You read every fact an agent may say about you and confirm it before
                  anyone dials. Say no and nothing is sent.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-[1fr_1.2fr]">
            <Reveal>
              <p className="text-eyebrow uppercase text-ink-muted">The receipts</p>
              <h2 className="mt-4 max-w-[18ch] text-balance text-headline font-medium">
                You can check our arithmetic.
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

        <section className="band-wash border-t border-rule">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
            <Reveal>
              <div className="grid gap-10 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-16">
                <div>
                  <p className="text-eyebrow uppercase text-ink-muted">Before you start</p>
                  <h2 className="mt-4 max-w-[16ch] text-balance text-headline font-medium">
                    The fair questions.
                  </h2>
                </div>

                <div className="border-t border-rule">
                  {FAQS.map((item) => (
                    <details key={item.question} className="group border-b border-rule py-4">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-small font-medium text-ink [&::-webkit-details-marker]:hidden">
                        {item.question}
                        <span
                          aria-hidden
                          className="mt-px shrink-0 text-ink-faint transition-transform duration-200 ease-out-expo group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-2 max-w-[62ch] text-small text-ink-muted">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
                <div>
                  <h2 className="max-w-[20ch] text-balance text-headline font-medium">
                    Two bills. Two minutes. One answer you can check.
                  </h2>
                  <p className="mt-4 max-w-[46ch] text-small text-ink-muted">
                    Start with your address. The rest takes as long as reading your last bill — and
                    if the numbers say leave it alone, that is the answer you get.
                  </p>
                </div>
                <Link href={withDemo('/onboarding', demo)} className={primaryCta}>
                  Get my verdict
                  <span
                    aria-hidden
                    className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

/**
 * Objections, answered with what the product already does. Nothing here claims
 * eligibility, approval or a saving — see `lib/verdict/__tests__/claims.test.ts`.
 */
const FAQS = [
  {
    question: 'Do I need to create an account?',
    answer:
      'No. No password, no server-side profile: what you enter stays in this browser, and clearing the site data clears it. The bill photo is read once and then discarded.',
  },
  {
    question: 'What if my house is a bad fit?',
    answer:
      'Then the answer is “don’t switch yet”, with the break-even electricity price and what would change it. A calculator that only knows how to say yes is a sales page, not an answer.',
  },
  {
    question: 'Will anyone call me?',
    answer:
      'Only if you ask. Nothing is preselected, and the quote path shows you the exact facts an agent may say about you before anything is sent. Choose stay and nothing leaves the page.',
  },
  {
    question: 'Is this only about heat pumps?',
    answer:
      'No. On oil or propane you can also compare dealer prices, and where an investor-owned utility delivers, compare your Basic Service rate against a competitive supplier. In a municipal light plant town the screen says plainly that there is no supply to shop.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Nothing. The verdict is an estimate, not a quote — a Home Energy Assessment determines eligibility and sizing — but it is free, and you do not have to talk to anyone to get it.',
  },
] as const

function SourceRow({ term, detail, index }: { term: string; detail: string; index: number }) {
  return (
    <Reveal index={index} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6">
      <dt className="text-small font-medium text-ink">{term}</dt>
      <dd className="text-small text-ink-muted">{detail}</dd>
    </Reveal>
  )
}
