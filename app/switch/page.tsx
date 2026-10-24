import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SwitchFlow } from '@/components/switch/switch-flow'
import { demoFromParams, withDemo } from '@/lib/demo'
import { getPrices } from '@/lib/prices'
import { buildSwitchModel } from '@/lib/switch/model'
import { loadProviders, outreachPlan } from '@/lib/switch/providers'

/**
 * @built F-148 `/switch` — Addendum B's best-case and switch steps, on the verdict's own query
 *
 * The page is a server component so the provider list, the outreach plan and the
 * dated prices never reach the browser as a secret or a key. The interactive part
 * is `SwitchFlow`, which only ever holds facts the household can see.
 *
 * `?demo=1` is honoured by the price reader and by `/api/switch`: the page reads
 * the baked snapshot, and the contact button returns baked `queued` statuses with
 * mode `demo` instead of sending anything. With no sender configured, the plan is
 * `off` and the page says so before anyone types anything.
 *
 * @built F-49 demo mode keeps the same model, the same query and the same verdict;
 * only the prices' source and the send path change
 */

export const metadata: Metadata = {
  title: 'What to do next',
  description:
    'Your options for heating fuel, electricity supply and a heat pump, why you would pick each, and what happens next. Nothing preselected.',
  robots: { index: false, follow: false },
}

interface SwitchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SwitchPage({ searchParams }: SwitchPageProps) {
  const params = await searchParams
  const demo = demoFromParams(params)
  const prices = await getPrices({ timeoutMs: 4_000, demo })
  const model = buildSwitchModel(params, prices)
  const providers = loadProviders()
  const plan = outreachPlan(providers)

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-eyebrow uppercase text-ink-muted">The decision</p>
            <div className="flex flex-wrap items-center gap-4 text-micro text-ink-muted">
              <Link
                href={withDemo('/dashboard', demo)}
                className="underline decoration-rule-strong underline-offset-4 hover:text-ink"
              >
                Dashboard
              </Link>
              <Link
                href={withDemo('/start', demo)}
                className="underline decoration-rule-strong underline-offset-4 hover:text-ink"
              >
                Change the numbers
              </Link>
            </div>
          </div>

          <h1 className="mt-4 max-w-[26ch] text-balance text-headline font-medium">
            The verdict is the easy part.
          </h1>
          <p className="mt-3 max-w-[64ch] text-lede text-ink-muted">
            Each option says why you would pick it and who does the work. Every price carries its source and its
            date, nothing is preselected, and no provider hears anything until you read exactly what would be said
            and confirm.
          </p>

          <div className="mt-10">
            {model.ready && model.result ? (
              <SwitchFlow model={model} providers={providers} plan={plan} />
            ) : (
              <section className="rounded-card border border-rule bg-surface p-6">
                <h2 className="text-title font-medium">The switch screen starts with a verdict.</h2>
                <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
                  {model.refusalMessage ??
                    'One of the numbers is missing or outside what this calculator will stand behind.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={withDemo(model.query ? `/start?${model.query}` : '/start', demo)}
                    className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
                  >
                    Enter the numbers
                  </Link>
                  <Link
                    href={withDemo('/start', demo)}
                    className="text-small text-ink-muted underline underline-offset-4"
                  >
                    Start from a bill
                  </Link>
                </div>
              </section>
            )}
          </div>

          <p className="mt-8 max-w-[70ch] text-micro text-ink-faint">
            Prices on this screen are the {prices.mode === 'live' ? 'live' : 'dated'} reading for {prices.asOf}. The
            electricity series describes {prices.elec.period}, so treat it as a period, not as today. Estimate only.
            Not a quote. A Home Energy Assessment determines eligibility and sizing.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
