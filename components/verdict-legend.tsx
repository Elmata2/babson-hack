import { VERDICT_META, VERDICT_ORDER } from '@/lib/verdicts'

/*
 * Verdict palette — the three answers as tone-coded cards.
 *
 * Colour carries meaning here, so it is always paired with the label and a
 * sentence. A colour-blind or greyscale reader still gets the whole message,
 * and so does a projector washing out the tint.
 */

export function VerdictLegend({ className = '' }: { className?: string }) {
  return (
    <ul className={`grid gap-3 md:grid-cols-3 ${className}`}>
      {VERDICT_ORDER.map((verdict, i) => {
        const meta = VERDICT_META[verdict]
        return (
          <li
            key={verdict}
            data-tone={meta.tone}
            className="flex flex-col gap-3 rounded-card border border-rule border-l-4 border-l-(--tone) bg-(--tone-tint) p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-eyebrow uppercase text-ink-muted">{meta.label}</span>
              <span className="num text-micro text-ink-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <p className="text-title font-medium text-ink">{meta.headline}</p>
            <p className="text-small text-ink-muted">{meta.detail}</p>
          </li>
        )
      })}
    </ul>
  )
}
