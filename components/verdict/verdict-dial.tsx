/**
 * @built F-34 verdict dial — three states, icon + label + colour
 * @built F-50 R14.1 the three carriers are data, not styling: `lib/verdict/signal`
 * gives each verdict a word, a tone and a shape, and every arc is painted at full
 * opacity so no stop depends on being "the coloured one"
 *
 * A dial with three stops, not a gauge with a score. The active answer gets the
 * sweep, the needle and its icon; the other two stay visible in their own colour
 * so a reader can see the closed set the answer came from (R8.1). Colour never
 * carries the message alone: every stop has an icon and a label, and the active
 * one also says "this house". The arcs used to be drawn at 32% opacity, which put
 * the inactive ones under the 3:1 non-text minimum; width and the needle now carry
 * that difference instead.
 */

import type { Verdict } from '@/lib/calc/types'
import { VERDICT_META, VERDICT_ORDER } from '@/lib/verdicts'
import { VERDICT_SIGNAL, type SignalShape } from '@/lib/verdict/signal'

const ACTIVE_ARC: Record<Verdict, string> = {
  SWITCH_NOW: 'var(--color-switch)',
  SWITCH_BEFORE_DEC31: 'var(--color-deadline)',
  DO_NOT_SWITCH_YET: 'var(--color-hold)',
}

/** Arc segments on the upper semicircle, in display order, left to right. */
const SEGMENTS: readonly { verdict: Verdict; from: number; to: number; mid: number }[] = [
  { verdict: 'SWITCH_NOW', from: Math.PI, to: (2 * Math.PI) / 3, mid: (5 * Math.PI) / 6 },
  { verdict: 'SWITCH_BEFORE_DEC31', from: (2 * Math.PI) / 3, to: Math.PI / 3, mid: Math.PI / 2 },
  { verdict: 'DO_NOT_SWITCH_YET', from: Math.PI / 3, to: 0, mid: Math.PI / 6 },
]

const SIZE = 240
const CENTRE = 120
const RADIUS = 88

function point(angle: number, radius = RADIUS): { x: number; y: number } {
  return {
    x: CENTRE + radius * Math.cos(angle),
    y: CENTRE - radius * Math.sin(angle),
  }
}

function arc(from: number, to: number): string {
  const start = point(from)
  const end = point(to)
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

function Icon({ shape }: { shape: SignalShape }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (shape === 'arrow') {
    return (
      <svg {...common}>
        <path d="M4 12 12 4M6 4h6v6" />
      </svg>
    )
  }
  if (shape === 'clock') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5v3.2l2 1.2" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M6 4v8M10 4v8" />
    </svg>
  )
}

export function VerdictDial({ verdict, className = '' }: { verdict: Verdict; className?: string }) {
  const active = SEGMENTS.find((segment) => segment.verdict === verdict) ?? SEGMENTS[0]
  const needleTip = point(active.mid, RADIUS - 26)

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${SIZE} ${CENTRE + 8}`}
        className="w-full max-w-[20rem]"
        role="img"
        aria-label={`The verdict is ${VERDICT_META[verdict].label}. The other two answers are ${VERDICT_ORDER.filter(
          (candidate) => candidate !== verdict,
        )
          .map((candidate) => VERDICT_META[candidate].label)
          .join(' and ')}.`}
      >
        {SEGMENTS.map((segment) => {
          const isActive = segment.verdict === verdict
          return (
            <path
              key={segment.verdict}
              d={arc(segment.from, segment.to)}
              fill="none"
              stroke={ACTIVE_ARC[segment.verdict]}
              strokeWidth={isActive ? 14 : 9}
              strokeLinecap="round"
            />
          )
        })}
        <line
          x1={CENTRE}
          y1={CENTRE}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="var(--color-ink)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={CENTRE} cy={CENTRE} r={4.5} fill="var(--color-ink)" />
      </svg>

      <figcaption>
        <ol className="mt-2 grid grid-cols-3 gap-2">
          {SEGMENTS.map((segment) => {
            const signal = VERDICT_SIGNAL[segment.verdict]
            const isActive = segment.verdict === verdict
            return (
              <li
                key={segment.verdict}
                data-tone={signal.tone}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'flex flex-col items-center gap-1 rounded-card border px-1.5 py-2 text-center',
                  isActive
                    ? 'border-(--tone-edge) bg-(--tone-tint) text-(--tone)'
                    : 'border-transparent text-ink-faint',
                ].join(' ')}
              >
                <span className="flex items-center gap-1">
                  <Icon shape={signal.shape} />
                  <span className="text-micro font-medium">{signal.word}</span>
                </span>
                {isActive ? <span className="text-eyebrow uppercase">this house</span> : null}
              </li>
            )
          })}
        </ol>
      </figcaption>
    </figure>
  )
}
