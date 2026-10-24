import { useEffect, useRef } from 'react'
import { PROVIDER_COLOUR } from './palette'
import { type SponsorKey } from '@/lib/elec-label'
import { heightShare, type EnergyMeta, type Metric } from '@/lib/map/energy-model'
import { SPONSOR_NAME } from '@/lib/utility'

export interface HeightLegend {
  title: string
  unit: string
  ticks: { value: number; label: string; share: number }[]
}

function roundSig(v: number): number {
  return v > 0 ? Number(v.toPrecision(2)) : 0
}

function solarDate(asOf: string): string {
  return new Date(`${asOf}T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Ticks are the rounded max divided by 1, 4 and 16, so each is exactly a quarter of the last. */
export function heightLegend(metric: Metric, max: number, meta: EnergyMeta): HeightLegend {
  const { usage, solar } = meta.sources
  const top = roundSig(max)
  const ticks = [1, 4, 16].map((d) => {
    const value = top / d
    return { value, label: value.toLocaleString('en-US', { maximumFractionDigits: 3 }), share: heightShare(value, top) }
  })
  return metric === 'usage'
    ? {
        title: `Column height = residential electricity use per year (Mass Save, ${usage.year})`,
        unit: 'MWh per year',
        ticks,
      }
    : {
        title: `Column height = installed solar (MassCEC ${solarDate(solar.asOf)})`,
        unit: 'MW (DC)',
        ticks,
      }
}

const TICK_PX = 28

export function EnergyLegend(props: {
  metric: Metric
  max: number
  meta: EnergyMeta
  colourBy: 'provider' | 'intensity'
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.open = window.matchMedia('(min-width: 640px)').matches
  }, [])
  const height = heightLegend(props.metric, props.max, props.meta)
  const providers = (Object.keys(PROVIDER_COLOUR) as (SponsorKey | 'mixed')[]).filter(
    (k) => k !== 'other' && k !== 'cape_light',
  )
  return (
    <details ref={ref} className="group rounded-md border border-rule bg-paper">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-between px-2.5 text-small text-ink [&::-webkit-details-marker]:hidden">
        What the columns mean
        <span aria-hidden className="text-ink-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 border-t border-rule p-2.5" role="group" aria-label="Map legend">
        <div>
          <p className="text-micro text-ink">{height.title}</p>
          <ul
            className="mt-1.5 flex items-end gap-4 text-micro text-ink-muted"
            aria-label={`Column height reference, ${height.unit}`}
          >
            {height.ticks.map((t) => (
              <li key={t.value} className="flex flex-col items-center gap-1">
                <i aria-hidden className="w-2.5 rounded-sm bg-ink-muted" style={{ height: Math.round(TICK_PX * t.share) }} />
                {t.label}
              </li>
            ))}
            <li className="pb-0.5">{height.unit}</li>
          </ul>
          <p className="mt-1 text-micro text-ink-muted">Tallest column on the left. Half the height is a quarter of the value.</p>
        </div>
        {props.colourBy === 'provider' ? (
          <div>
            <p className="text-micro text-ink">Colour = who delivers your power</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-micro text-ink-muted" aria-label="Provider colours">
              {providers.map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <i className="size-2 rounded-full" style={{ background: PROVIDER_COLOUR[k] }} />
                  {k === 'mixed' ? 'Mixed' : SPONSOR_NAME[k]}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-micro text-ink">Colour = the same measure as height: brighter columns carry more.</p>
        )}
      </div>
    </details>
  )
}
