/**
 * @built F-50 R14.3 — the enhanced path as a visible line on the verdict screen
 *
 * Not a badge, not a tooltip, not a footnote under the rebate stack: a heading, a
 * sentence that says what the income-qualified award can reach, and a link that
 * switches this exact URL to the enhanced tier. `lib/verdict/enhanced-offer`
 * decides whether it may appear at all; this component only draws it.
 *
 * The copy is the offer's own, so the $16,000 is the rebate table's cap rather
 * than a number typed into a template.
 */

import Link from 'next/link'

import type { EnhancedOffer } from '@/lib/verdict/enhanced-offer'

export function EnhancedOfferLine({ offer }: { offer: EnhancedOffer }) {
  if (!offer.show || offer.href === null) return null

  return (
    <section aria-labelledby="enhanced-path" className="mt-6 border-t border-rule pt-4">
      <h2 id="enhanced-path" className="text-small font-medium text-ink">
        {offer.headline}
      </h2>
      <p className="mt-1 max-w-[62ch] text-small text-ink">{offer.body}</p>
      <Link
        href={offer.href}
        className="mt-2 inline-block rounded-sm text-small font-medium text-ink underline decoration-rule-strong decoration-1 underline-offset-4 hover:decoration-ink"
      >
        {offer.linkLabel} →
      </Link>
    </section>
  )
}
