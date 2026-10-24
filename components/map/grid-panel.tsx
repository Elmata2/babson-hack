'use client'

/**
 * @built F-72 Grid section of the Town tab: polar 24 h clock, hour stats, provider split
 * @built F-75 real zonal load, residential use, solar capacity and their sources
 */

import { SPONSOR_NAME } from '@/lib/utility'
import {
  ZONE_LABEL,
  dayLabel,
  formatMW,
  formatMWh,
  hourLabel,
  sourceLine,
  totalsOf,
  usageNote,
  zoneLoad,
  type BakedEnergy,
  type EnergyTown,
  type Provider,
  type Zone,
} from '@/lib/map/energy-model'
import { PROVIDER_COLOUR } from './palette'

const R = 100
const R0 = 26

export function GridPanel({
  towns,
  baked,
  day,
  days,
  onDay,
  scopeLabel,
  region,
  hour,
  isTown,
}: {
  towns: EnergyTown[]
  baked: BakedEnergy
  day: string
  days: readonly string[]
  onDay: (d: string) => void
  scopeLabel: string
  region: Zone | 'ALL'
  hour: number
  isTown: boolean
}) {
  const clockZone = isTown ? towns[0].zone : region
  const load = zoneLoad(baked, day, clockZone)
  const peak = Math.max(...load)
  const peakHour = load.indexOf(peak)
  const totals = totalsOf(towns)
  const town = isTown ? towns[0] : null

  const pt = (h: number, v: number): [number, number] => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2
    const r = R0 + ((R - R0) * v) / peak
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  const path = `M${load.map((mw, h) => pt(h, mw).map((n) => n.toFixed(1)).join(',')).join('L')}Z`
  const [hx, hy] = pt(hour, load[hour])
  const rows = (Object.entries(totals.byProvider) as [Provider, number][])
    .map(([key, mwh]) => ({ key, share: totals.residentialMWh > 0 ? mwh / totals.residentialMWh : 0 }))
    .filter((r) => r.share >= 0.005)
    .sort((a, b) => b.share - a.share)

  const stats: [string, string][] = [
    [formatMW(load[hour]), `load at ${hourLabel(hour)}`],
    [formatMW(peak), `day peak, ${hourLabel(peakHour)}`],
    town
      ? [totals.reportedTowns > 0 ? formatMWh(totals.residentialMWh) : '—', usageNote(town) ?? 'residential use']
      : [formatMWh(totals.residentialMWh), `residential use, ${totals.reportedTowns} of ${totals.townCount} towns reported`],
    [formatMW(totals.solarMW), 'solar installed (DC)'],
    [totals.solarSystems.toLocaleString('en-US'), 'solar systems'],
  ]

  return (
    <div className="flex flex-col gap-3">
      {!isTown ? (
        <p className="text-small font-medium text-ink">
          {scopeLabel} · {ZONE_LABEL[region]}
        </p>
      ) : null}
      <div role="group" aria-label="Grid load day" className="flex flex-wrap gap-1.5">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={day === d}
            onClick={() => onDay(d)}
            className="h-8 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink transition-colors hover:bg-paper-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {dayLabel(d)}
          </button>
        ))}
      </div>
      {isTown ? (
        <p className="text-micro text-ink-muted">Grid load shown is the {ZONE_LABEL[clockZone]} zone, not {scopeLabel} alone.</p>
      ) : null}
      <svg viewBox="-130 -130 260 260" role="img" aria-label={`Zone load by hour, ${ZONE_LABEL[clockZone]}, ${dayLabel(day)}.`} className="mx-auto w-full max-w-[260px]">
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
        <path d={path} fill="oklch(0.54 0.15 255 / 0.14)" stroke="var(--color-focus)" strokeWidth="1.5" />
        <line x1="0" y1="0" x2={hx} y2={hy} stroke="var(--color-ink-faint)" strokeDasharray="2 3" />
        <circle cx={hx} cy={hy} r="4" fill="var(--color-ink)" />
        <text y="-2" fill="var(--color-ink)" fontSize="13" fontWeight="600" textAnchor="middle">
          {formatMW(load[hour])}
        </text>
        <text y="12" fill="var(--color-ink-muted)" fontSize="9" textAnchor="middle">
          {hourLabel(hour)}
        </text>
      </svg>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map(([value, label]) => (
          <div key={label} className="rounded-md bg-paper p-2">
            <dd className="num text-small font-medium text-ink">{value}</dd>
            <dt className="text-micro text-ink-muted">{label}</dt>
          </div>
        ))}
      </dl>
      {!isTown ? (
        <ul className="flex flex-col gap-1.5" aria-label="Residential use by utility">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[110px_1fr_36px] items-center gap-2 text-micro text-ink-muted">
              <span>{r.key === 'mixed' ? 'Mixed towns' : SPONSOR_NAME[r.key]}</span>
              <i className="block h-1.5 rounded-full" style={{ width: `${Math.round(r.share * 100)}%`, background: PROVIDER_COLOUR[r.key] }} />
              <span className="num text-right">{Math.round(r.share * 100)}%</span>
            </li>
          ))}
          <li className="text-micro text-ink-faint">Reported towns only: {totals.townCount - totals.reportedTowns} municipal light plant or suppressed towns have no Mass Save figure. Towns served by more than one utility are their own group, not split.</li>
        </ul>
      ) : null}
      <p className="text-micro text-ink-faint">{sourceLine(baked._meta, day)}</p>
    </div>
  )
}
