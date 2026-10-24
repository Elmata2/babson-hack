'use client'

/**
 * @built F-43 the metric switcher: oil share, oil spend, cliff dollars
 * @built F-45 the 2026 ↔ 2027 scrubber, the tweened statewide loss, and reduced motion
 * @built F-48 the static-map and table buttons that keep the lens usable without tiles
 *
 * Everything numeric here comes from `lib/map/heat.ts`; this file formats and lays
 * out. The legend reads `heatScale(metric, year)` — the same function `layers.ts`
 * paints from — so the five swatches can never describe a scale the map is not
 * drawing, and the 750 gal assumption is printed under the ramp, not tucked in a
 * tooltip.
 */

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './camera-controls'
import { HEAT_RAMP, NO_DATA } from './palette'
import {
  ASSUMPTION_NOTE,
  CLIFF_SOURCE,
  HEAT_METRICS,
  HEAT_METRIC_HINT,
  HEAT_METRIC_LABEL,
  OIL_PRICE_AS_OF,
  OIL_PRICE_USD_PER_GAL,
  countyHeatRows,
  formatMillions,
  heatScale,
  price,
  stateHeatTotals,
  percent,
  type HeatMetric,
  type HeatYear,
} from '@/lib/map/heat'

const CHIP =
  'h-8 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink transition-colors hover:bg-paper-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper'

const ACTION =
  'h-8 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink transition-colors hover:bg-paper-sunk'

export interface HeatControlsProps {
  metric: HeatMetric
  onMetric: (metric: HeatMetric) => void
  year: HeatYear
  onYear: (year: HeatYear) => void
  ejOn: boolean
  onEj: (on: boolean) => void
  onTable: () => void
  onStatic: () => void
  /** False until the tract geometry is in: the county table still works. */
  tractsReady: boolean
}

export function HeatControls(props: HeatControlsProps) {
  const { metric, year } = props
  const scale = heatScale(metric, year)
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-3">
      <div>
        <p className="text-micro font-medium text-ink" id="heat-metric-label">
          Metric
        </p>
        <div role="group" aria-labelledby="heat-metric-label" className="mt-1.5 flex flex-wrap gap-1.5">
          {HEAT_METRICS.map((m) => (
            <button key={m} type="button" className={CHIP} aria-pressed={metric === m} onClick={() => props.onMetric(m)}>
              {HEAT_METRIC_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-micro text-ink-muted">{HEAT_METRIC_HINT[metric]}</p>
      </div>

      <YearScrubber year={year} onYear={props.onYear} />

      <div>
        <p className="text-micro font-medium text-ink">{year} · what the colour means</p>
        <ul className="mt-2 flex flex-col gap-1" aria-label="Legend">
          {HEAT_RAMP.map((colour, i) => (
            <li key={colour} className="flex items-center gap-2 text-micro text-ink-muted">
              <i className="h-3 w-6 rounded-sm border border-rule" style={{ background: colour }} />
              {scale.labels[i]}
            </li>
          ))}
          <li className="flex items-center gap-2 text-micro text-ink-muted">
            <i className="h-3 w-6 rounded-sm border border-rule" style={{ background: NO_DATA }} />
            No households or no estimate
          </li>
        </ul>
        <p className="mt-2 text-micro text-ink-muted">{scale.note}</p>
        <p className="mt-1 text-micro text-ink-faint">
          Oil spend {ASSUMPTION_NOTE} at {price(OIL_PRICE_USD_PER_GAL)}/gal (DOER {OIL_PRICE_AS_OF}). {CLIFF_SOURCE}.
        </p>
      </div>

      <CountyFigures year={year} tractsReady={props.tractsReady} onTable={props.onTable} />

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={ACTION} onClick={props.onTable} aria-haspopup="dialog">
          Table view
        </button>
        <button type="button" className={ACTION} onClick={props.onStatic} aria-haspopup="dialog">
          Static map
        </button>
      </div>
      {!props.tractsReady ? (
        <p className="text-micro text-ink-faint" role="status">
          Tract boundaries are still loading. The table and the county figures work now.
        </p>
      ) : null}

      <div>
        <label className="inline-flex items-center gap-2 text-micro text-ink">
          <input type="checkbox" checked={props.ejOn} onChange={(e) => props.onEj(e.target.checked)} /> Environmental justice
          block groups
        </label>
        {props.ejOn ? (
          <p className="mt-1.5 text-micro text-ink-muted">
            Violet marks a tract holding an EJ block group (MassGIS EJ2020). A lens, not a filter: the heat colours, the
            ranking and every number stay exactly as they were.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * R10.13: the county figures are final before a byte of tract geometry arrives.
 *
 * They come from the committed ACS table and the committed town→tract index, so this
 * block is true at first paint on a slow connection, after a failed geometry chunk and
 * after a failed tile. Five rows, plus the way to the other nine in the table.
 */
export function CountyFigures({ year, tractsReady, onTable }: { year: HeatYear; tractsReady: boolean; onTable: () => void }) {
  const counties = countyHeatRows()
  const state = stateHeatTotals()
  const top = counties.slice(0, 4)
  return (
    <div>
      <p className="text-micro font-medium text-ink">Counties, now</p>
      <ul className="mt-1.5 flex flex-col gap-1" aria-label="County heating oil figures">
        {top.map((county) => (
          <li key={county.fips} className="flex items-baseline justify-between gap-2 text-micro text-ink-muted">
            <span>
              {county.name} · {percent(county.oilShare)}
            </span>
            <span className="num text-ink">{year === 2027 ? formatMillions(county.cliffDollars) : '—'}</span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-2 text-micro text-ink">
          <span>Massachusetts · {percent(state.oilShare)}</span>
          <span className="num">{year === 2027 ? formatMillions(state.cliffDollars) : '—'}</span>
        </li>
      </ul>
      <p className="mt-1 text-micro text-ink-faint">
        {tractsReady
          ? `${counties.length} counties, summed from the same tracts as the map.`
          : 'Final before the tract layer loads.'}{' '}
        <button type="button" onClick={onTable} className="underline decoration-rule-strong underline-offset-2 hover:text-ink">
          All {counties.length}
        </button>
      </p>
    </div>
  )
}

/** The single 2026 ↔ 2027 control: a real range input, two keys, and a readable value. */
export function YearScrubber({ year, onYear }: { year: HeatYear; onYear: (year: HeatYear) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="heat-year" className="text-micro font-medium text-ink">
          Install year
        </label>
        <p className="num text-micro text-ink-muted" aria-hidden>
          {year}
        </p>
      </div>
      <input
        id="heat-year"
        type="range"
        min={2026}
        max={2027}
        step={1}
        value={year}
        aria-valuetext={year === 2026 ? '2026, before the step-down' : '2027, after the Jan 1 step-down'}
        onChange={(e) => onYear(Number(e.target.value) === 2027 ? 2027 : 2026)}
        className="mt-1.5 h-8 w-full accent-ink"
      />
      <div className="flex justify-between text-micro text-ink-muted">
        <button type="button" className="hover:text-ink" aria-pressed={year === 2026} onClick={() => onYear(2026)}>
          2026
        </button>
        <button type="button" className="hover:text-ink" aria-pressed={year === 2027} onClick={() => onYear(2027)}>
          2027 · Jan 1
        </button>
      </div>
    </div>
  )
}

/**
 * The headline the scrubber animates: "$0 lost" → "$624.5M lost on Jan 1".
 *
 * The visible digits are `aria-hidden` while they move; the settled sentence is
 * announced once through a status region, so a screen reader is not read a number
 * sixty times a second. `prefers-reduced-motion` skips the tween entirely and lands
 * on the final figure in the same frame as the state change.
 */
export function HeatHeadline({ year, dollars }: { year: HeatYear; dollars: number }) {
  const target = year === 2027 ? dollars : 0
  const shown = useTweened(target)
  const settled = year === 2027 ? `${formatMillions(dollars)} lost on Jan 1` : '$0 lost'
  return (
    <div className="rounded-card border border-rule bg-paper px-3 py-2">
      <p className="text-eyebrow uppercase text-ink-muted">Massachusetts</p>
      <p className="num mt-0.5 text-title font-medium text-ink" aria-hidden>
        {year === 2027 ? `${formatMillions(shown)} lost` : '$0 lost'}
        {year === 2027 ? <span className="text-small font-normal text-ink-muted"> on Jan 1</span> : null}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {settled}
      </p>
      <p className="mt-0.5 text-micro text-ink-muted">
        {year === 2027
          ? 'Oil-heated households × the $1,000 step-down.'
          : 'Nothing has been lost yet. Move to 2027 to see the step-down.'}
      </p>
    </div>
  )
}

/** rAF tween to `target`, or straight there when the reader asked for less motion. */
function useTweened(target: number): number {
  const [value, setValue] = useState(target)
  const frame = useRef<number | null>(null)
  const from = useRef(target)

  useEffect(() => {
    const begin = from.current
    const delta = target - begin
    // Every state write happens inside a frame callback, never in the effect body.
    const kick = () => {
      if (prefersReducedMotion() || delta === 0) {
        setValue(target)
        from.current = target
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 700)
        // Ease-out cubic: fast first, settles on the number.
        const eased = 1 - Math.pow(1 - t, 3)
        setValue(begin + delta * eased)
        if (t < 1) frame.current = requestAnimationFrame(step)
        else from.current = target
      }
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(kick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      from.current = target
    }
  }, [target])

  return value
}
