import type { Metadata } from 'next'
import Link from 'next/link'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { demoFromParams, withDemo } from '@/lib/demo'
import { TOWNS } from '@/lib/geo'
import { getPrices } from '@/lib/prices'

/**
 * @built F-137 `/onboarding` — Addendum B's four steps, on the anonymous app's parts
 * @built F-49 `?demo=1` reads the baked snapshot and the wizard's geocode and bill
 * requests carry the flag, so the whole four-step flow works with the wifi off
 *
 * The server reads the 351-town table and the prices, as `/start` does, so the
 * browser never downloads the geometry and never sees a key. The wizard itself is
 * a client component because a photo, an OCR read and a confirmation only exist in
 * the browser.
 *
 * Deliberately not here yet: the best-case switch screen, `/dashboard` and
 * `/settings`. Those need an account with a home on a server, which this build
 * does not have. The wizard ends where the app already is honest: the verdict.
 */

export const metadata: Metadata = {
  title: 'Create your profile',
  description:
    'Four steps: a profile, a photo of your bill, your house, and the honest heat-pump verdict for Massachusetts.',
  robots: { index: false, follow: false },
}

interface OnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const demo = demoFromParams(await searchParams)
  const prices = await getPrices({ timeoutMs: 4_000, demo })

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-eyebrow uppercase text-ink-muted">Your profile</p>
            <Link
              href={withDemo('/start', demo)}
              className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              Skip the profile and try it anonymously
            </Link>
          </div>

          <h1 className="mt-4 max-w-[24ch] text-balance text-headline font-medium">
            Four steps to the honest answer.
          </h1>
          <p className="mt-3 max-w-[62ch] text-lede text-ink-muted">
            A profile, one photo of a bill, the town, then the verdict. The profile is kept in this browser — no
            password, no account on a server, and the bill image is read once and discarded.
          </p>

          {demo ? (
            <p className="mt-3 max-w-[62ch] text-micro text-ink-muted">
              Demo mode: the address lookup and bill reading are off. Pick your town and type the two numbers — the
              verdict and the prices are identical to the live path.
            </p>
          ) : null}

          <div className="mt-10">
            <OnboardingWizard
              towns={TOWNS}
              prices={{
                mode: prices.mode,
                asOf: prices.asOf,
                oil: prices.oil.usdPerUnit,
                propane: prices.propane.usdPerUnit,
                elec: prices.elec.usdPerUnit,
              }}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
