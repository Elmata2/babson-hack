/**
 * @built F-40 three demo houses — the home page's way into the product without typing
 *
 * Each card is a plain link to `/verdict` with a complete query, so the demo
 * path is the product path: the answer is recomputed from today's prices and the
 * committed rules, not read from a fixture. The promise on the card is asserted
 * in `lib/verdict/__tests__/presets.test.ts`.
 */

import Link from 'next/link'

import { DEMO_PRESETS } from '@/lib/verdict/presets'
import { VERDICT_META } from '@/lib/verdicts'

export function DemoPresets({ className = '' }: { className?: string }) {
  return (
    <section className={className} aria-labelledby="demo-presets-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="demo-presets-heading" className="text-title font-medium">
          Three houses, three answers
        </h2>
        <p className="text-micro text-ink-muted">Open one — the verdict is recomputed live, not replayed</p>
      </div>

      <ul className="mt-5 grid gap-3 md:grid-cols-3">
        {DEMO_PRESETS.map((preset) => {
          const meta = VERDICT_META[preset.expects]
          return (
            <li
              key={preset.key}
              data-tone={meta.tone}
              className="rounded-card border border-rule border-l-4 border-l-(--tone) bg-surface"
            >
              <Link href={preset.href} className="block p-4 transition-colors hover:bg-(--tone-tint)">
                <p className="text-eyebrow uppercase text-ink-faint">{meta.label}</p>
                <p className="mt-2 text-small font-medium text-ink">{preset.label}</p>
                <p className="mt-1 text-micro text-ink-muted">{preset.blurb}</p>
                <p className="mt-3 text-micro font-medium text-(--tone)">
                  See this verdict <span aria-hidden>→</span>
                </p>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 max-w-[70ch] text-micro text-ink-faint">
        The numbers are a household&rsquo;s fuel use and price; the electricity price comes from the live EIA reading or
        the dated DOER snapshot, exactly as it does for a household that typed its own bill.
      </p>
    </section>
  )
}
