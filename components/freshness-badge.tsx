import { formatDateShort, type FreshnessKind } from '@/lib/freshness'

/**
 * @built F-14 freshness badge — `live` / `snapshot 19 Oct` / `assessor`
 *
 * A badge is a claim about a number, so it is a component and not decoration:
 * the tone is in the same palette as the verdict, the date is always rendered
 * when the source has one, and the title spells out the full sentence for anyone
 * who needs it. Never render a badge without passing the value it describes.
 */

const STYLES: Record<FreshnessKind, { tone: string; label: string; title: string }> = {
  live: {
    tone: 'text-switch border-switch-edge bg-switch-tint',
    label: 'Live',
    title: 'Fetched from the live source just now.',
  },
  snapshot: {
    tone: 'text-deadline border-deadline-edge bg-deadline-tint',
    label: 'Snapshot',
    title: 'The live source did not answer, so this is the dated baked reading.',
  },
  assessor: {
    tone: 'text-hold border-hold-edge bg-hold-tint',
    label: 'Assessor',
    title: 'Read from the MassGIS parcel record for this address.',
  },
  manual: {
    tone: 'text-ink-muted border-rule bg-paper-sunk',
    label: 'You entered',
    title: 'Typed or corrected by the household, not read from a source.',
  },
  baked: {
    tone: 'text-ink-muted border-rule bg-paper-sunk',
    label: 'Baked',
    title: 'Committed at build time from a dated open dataset.',
  },
}

export interface FreshnessBadgeProps {
  kind: FreshnessKind
  /** ISO date or month the value describes. */
  date?: string | null
  /** Override the default label, e.g. `Prices` or `Year built`. */
  label?: string
  className?: string
}

export function FreshnessBadge({ kind, date, label, className = '' }: FreshnessBadgeProps) {
  const style = STYLES[kind]
  const short = formatDateShort(date ?? null)
  const text = [label ?? style.label, short].filter(Boolean).join(' · ')

  return (
    <span
      title={date ? `${style.title} Describes ${date}.` : style.title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-0.5 text-micro font-medium ${style.tone} ${className}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {text}
    </span>
  )
}
