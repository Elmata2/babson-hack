/** @built F-120 the decision gate UI — four choices, nothing preselected, STAY the same weight */
import Link from 'next/link'

import { ContactsList } from '@/components/verdict/contacts-list'
import { ReminderButton } from '@/components/verdict/reminder-button'
import { withDemo } from '@/lib/demo'
import type { ContactsBlock } from '@/lib/verdict/contacts'
import type { Recommendation } from '@/lib/verdict/recommendation'

const PRIMARY = 'inline-block rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper'
const LINK = 'text-small text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink'

export function RecommendationCard({
  recommendation,
  demo,
  mapHref,
  mapLabel,
  contacts,
}: {
  recommendation: Recommendation
  demo: boolean
  mapHref?: string
  mapLabel?: string
  contacts?: ContactsBlock | null
}) {
  return (
    <section className="rounded-card border border-rule bg-surface p-5 sm:p-6">
      <h2 className="text-eyebrow uppercase text-ink-muted">What to do next</h2>
      <p className="mt-3 max-w-[56ch] text-title font-medium">{recommendation.headline}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {recommendation.kind === 'stay' ? (
          <ReminderButton label={recommendation.reminderLabel} className={PRIMARY} />
        ) : (
          <>
            <Link href={withDemo(recommendation.agentHref, demo)} className={PRIMARY}>
              {recommendation.agentLabel}
            </Link>
            <Link href={withDemo(recommendation.kitHref, demo)} className={LINK}>
              Do it myself with the switch kit
            </Link>
          </>
        )}
      </div>

      {recommendation.kind === 'quotes' ? (
        <p className="mt-3 max-w-[64ch] text-micro text-ink-muted">{recommendation.agentNote}</p>
      ) : null}

      {recommendation.secondary ? (
        <p className="mt-4 max-w-[64ch] border-t border-rule pt-4 text-small text-ink">
          {recommendation.secondary.text}{' '}
          <Link href={withDemo(recommendation.secondary.href, demo)} className="underline underline-offset-4">
            {recommendation.secondary.linkLabel}
          </Link>
        </p>
      ) : null}

      {contacts ? <ContactsList block={contacts} /> : null}

      {recommendation.others.length ? (
        <p className="mt-4 text-micro text-ink-faint">
          Other options:{' '}
          {recommendation.others.map((other, index) => (
            <span key={other.choice}>
              {index > 0 ? ' · ' : null}
              <Link
                href={withDemo(other.href, demo)}
                className="underline decoration-rule-strong underline-offset-4 hover:text-ink"
              >
                {other.label}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {mapHref && mapLabel ? (
        <p className="mt-4">
          <Link href={mapHref} className={LINK}>
            {mapLabel}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
