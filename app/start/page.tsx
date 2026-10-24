import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { IntakeForm } from '@/components/intake-form'
import { demoFromParams, withDemo } from '@/lib/demo'
import { fromSearchParams } from '@/lib/intake/params'
import { TOWNS } from '@/lib/geo'
import { getPrices } from '@/lib/prices'

/**
 * @built F-31 address intake lives here — the form is a client component, the
 * prices and the 351-town table are read on the server so the browser never
 * downloads the tract geometry or a key.
 * @built F-49 `?demo=1` reads the baked snapshot and the form's own requests carry
 * the flag, so geocode, parcel and bill reading all take their manual path
 *
 * Prices come from the cached price reader (daily); the badge says which
 * reading is on screen and the date it describes.
 */

export const metadata: Metadata = {
  title: 'Start',
  description:
    'A Massachusetts address, a heating bill, and one verdict: switch, switch before 31 December, or leave it alone.',
}

interface StartPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StartPage({ searchParams }: StartPageProps) {
  // @built F-106 the verdict's "Change the numbers" link brings its query back here.
  const params = await searchParams
  const initial = fromSearchParams(params)
  const demo = demoFromParams(params)
  const prices = await getPrices({ timeoutMs: 4_000, demo })

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-eyebrow uppercase text-ink-muted">The intake</p>
            <Link
              href={withDemo('/', demo)}
              className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              Back to the overview
            </Link>
          </div>

          <h1 className="mt-4 max-w-[24ch] text-balance text-headline font-medium">
            Three answers. One of them is no.
          </h1>
          <p className="mt-3 max-w-[58ch] text-lede text-ink-muted">
            Two numbers off your bill is enough. The address is a shortcut, not a requirement — it sets the
            climate zone and the utility sponsor, and nothing is stored.
          </p>

          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <IntakeForm
              towns={TOWNS}
              initial={initial}
              prices={{
                mode: prices.mode,
                asOf: prices.asOf,
                oil: prices.oil.usdPerUnit,
                propane: prices.propane.usdPerUnit,
                elec: prices.elec.usdPerUnit,
              }}
            />

            <aside className="grid gap-4 self-start rounded-card border border-rule bg-surface p-5">
              <h2 className="text-small font-medium">What the verdict will use</h2>
              <dl className="grid gap-3 text-micro">
                <div className="grid gap-1">
                  <dt className="text-ink-muted">Heating oil</dt>
                  <dd className="tabular-nums text-ink">
                    ${prices.oil.usdPerUnit.toFixed(2)}/gal · {prices.oil.source} · {prices.oil.period}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-ink-muted">Propane</dt>
                  <dd className="tabular-nums text-ink">
                    ${prices.propane.usdPerUnit.toFixed(2)}/gal · {prices.propane.source} · {prices.propane.period}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-ink-muted">Electricity, all-in</dt>
                  <dd className="tabular-nums text-ink">
                    {(prices.elec.usdPerUnit * 100).toFixed(1)}¢/kWh · {prices.elec.source} · {prices.elec.period}
                  </dd>
                </div>
              </dl>

              {prices.notes.length ? (
                <ul className="grid gap-1 border-t border-rule pt-3 text-micro text-ink-muted">
                  {prices.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}

              <p className="border-t border-rule pt-3 text-micro text-ink-faint">
                Climate comes from {TOWNS.length} municipalities&rsquo; county degree days. The rebate tiers are
                versioned rules, not a model&rsquo;s memory.
              </p>

              {demo ? (
                <p className="text-micro text-ink-faint">
                  Demo mode: address, parcel and bill lookups are off. Pick your town from the list and type the
                  two numbers — the verdict is identical.
                </p>
              ) : null}

              <p className="text-micro text-ink-faint">
                Every route is an enrichment: with all of them deleted, the two numbers still produce a verdict.
              </p>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
