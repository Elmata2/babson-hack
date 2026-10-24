'use client'

/**
 * @built F-72 Grid tab: polar 24 h clock, hour stats, provider split (all mock numbers)
 */

import { SPONSOR_NAME } from '@/lib/utility'
import type { SponsorKey } from '@/lib/elec-label'
import {
  LOAD_SHAPE,
  ZONE_LABEL,
  formatMW,
  hourLabel,
  totalsAt,
  type EnergyTown,
  type Zone,
} from '@/lib/map/energy-model'
import { PROVIDER_COLOUR } from './palette'

const R = 100
const R0 = 26

export function GridPanel({
  towns,
  scopeLabel,
  region,
  hour,
  isTown,
}: {
  towns: EnergyTown[]
  scopeLabel: string
  region: Zone | 'ALL'
  hour: number
  isTown: boolean
}) {
  const hours = LOAD_SHAPE.map((_, h) => totalsAt(towns, h))
  const peak = Math.max(...hours.map((t) => t.demand)) || 1
  const now = hours[hour]
  const annual = towns.reduce((s, t) => s + t.annualMWh, 0)
  const solarCap = towns.reduce((s, t) => s + t.solarMW, 0)

  const pt = (h: number, v: number): [number, number] => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2
    const r = R0 + ((R - R0) * v) / peak
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  const path = (key: 'demand' | 'solar') => `M${hours.map((t, h) => pt(h, t[key]).map((n) => n.toFixed(1)).join(',')).join('L')}Z`
  const [hx, hy] = pt(hour, now.demand)
  const rows = (Object.entries(now.byProvider) as [SponsorKey, number][])
    .map(([key, mw]) => ({ key, mw, share: now.demand > 0 ? mw / now.demand : 0 }))
    .filter((r) => r.share >= 0.005)
    .sort((a, b) => b.mw - a.mw)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small font-medium text-ink">
        {scopeLabel}
        {!isTown ? ` · ${ZONE_LABEL[region]}` : ''}
      </p>
      <svg viewBox="-130 -130 260 260" role="img" aria-label={`Load by hour, ${scopeLabel}. Invented figures.`} className="mx-auto w-full max-w-[260px]">
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <circle key={k} r={R0 + (R - R0) * k} fill="none" stroke="var(--color-rule)" />
        ))}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(h, peak * 1.17)
          return (
            <text key={h} x={x} y={y} fill="var(--color-ink-muted)" fontSize="10" textAnchor="middle" dominantBaseline="middle">
              {hourLabel(h)}
            </text>
          )
        })}
        <path d={path('demand')} fill="oklch(0.54 0.15 255 / 0.14)" stroke="var(--color-focus)" strokeWidth="1.5" />
        <path d={path('solar')} fill="oklch(0.786 0.104 65 / 0.25)" stroke="var(--color-deadline)" strokeWidth="1.2" />
        <line x1="0" y1="0" x2={hx} y2={hy} stroke="var(--color-ink-faint)" strokeDasharray="2 3" />
        <circle cx={hx} cy={hy} r="4" fill="var(--color-ink)" />
        <text y="-2" fill="var(--color-ink)" fontSize="13" fontWeight="600" textAnchor="middle">
          {formatMW(now.demand)}
        </text>
        <text y="12" fill="var(--color-ink-muted)" fontSize="9" textAnchor="middle">
          {hourLabel(hour)}
        </text>
      </svg>
      <p className="flex gap-3 text-micro text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-3 bg-focus" /> Demand
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-3 bg-deadline" /> Solar
        </span>
      </p>
      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            [formatMW(now.demand), `demand at ${hourLabel(hour)}`],
            [formatMW(now.solar), 'solar output'],
            [`${(annual / 1e6).toFixed(annual > 1e6 ? 1 : 3)} TWh`, 'annual use'],
            [formatMW(solarCap), 'solar installed'],
          ] as const
        ).map(([value, label]) => (
          <div key={label} className="rounded-md bg-paper p-2">
            <dd className="num text-small font-medium text-ink">{value}</dd>
            <dt className="text-micro text-ink-muted">{label}</dt>
          </div>
        ))}
      </dl>
      {!isTown ? (
        <ul className="flex flex-col gap-1.5" aria-label="Demand by utility">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-micro text-ink-muted">
              <span>{SPONSOR_NAME[r.key]}</span>
              <i className="block h-1.5 rounded-full" style={{ width: `${Math.round(r.share * 100)}%`, background: PROVIDER_COLOUR[r.key] }} />
              <span className="num text-right">{Math.round(r.share * 100)}%</span>
            </li>
          ))}
          <li className="text-micro text-ink-faint">Mixed towns split evenly between their utilities.</li>
        </ul>
      ) : null}
      <p className="text-micro font-medium text-deadline">Demand and solar figures are invented.</p>
    </div>
  )
}
