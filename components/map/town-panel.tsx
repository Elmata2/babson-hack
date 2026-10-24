'use client'

/**
 * @built F-44 Town tab: utility gate, selected tract stats, town heating-fuel roll-up
 *
 * The utility line is the correctness gate from `resolveUtility`. A municipal light
 * plant town says so in plain words; a mixed town asks instead of guessing.
 */

import { GEO_META, tractStats, tractStatsOfTown, townsOfTract } from '@/lib/geo'
import { SPONSOR_NAME, UTILITY_META, resolveUtility } from '@/lib/utility'

const pct = (share: number) => `${(Math.round(share * 1000) / 10).toLocaleString('en-US')}%`
const int = (n: number) => n.toLocaleString('en-US')
const day = (iso: string) => iso.slice(0, 10)

export function TownPanel({ town, tract, onClearTract }: { town: string | null; tract: string | null; onClearTract: () => void }) {
  if (!town) {
    return (
      <p className="text-small text-ink-muted">
        Pick a town: search for one, or click it on the map. In the Heat lens, click a tract to see its heating-fuel mix.
      </p>
    )
  }
  const res = resolveUtility(town)
  const tractRow = tract ? tractStats(tract) : null
  const rows = tractStatsOfTown(town)
  const households = rows.reduce((s, r) => s + r.households, 0)
  const oil = rows.reduce((s, r) => s + r.oilHouseholds, 0)

  let utilityLine: string
  if (!res.found) utilityLine = res.reason ?? 'We do not have this town.'
  else if (res.eligibleForMassSave === false) utilityLine = 'Municipal light plant — Mass Save rebates do not apply'
  else if (res.mixed || res.sponsors.length > 1) {
    utilityLine = `Served by ${res.sponsors.map((s) => SPONSOR_NAME[s]).join(' and ')}. Which one bills you depends on your address.`
  } else if (res.eligibleForMassSave === true) utilityLine = `${SPONSOR_NAME[res.sponsors[0]]}, a Mass Save sponsor`
  else utilityLine = res.reason ?? 'Utility not confirmed.'

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Utility">
        <p className="text-eyebrow uppercase text-ink-muted">Electric utility</p>
        <p className="mt-1 text-small text-ink">{utilityLine}</p>
        {res.reason && res.eligibleForMassSave === null ? <p className="mt-1 text-micro text-ink-muted">{res.reason}</p> : null}
        <p className="mt-1 text-micro text-ink-faint">
          {UTILITY_META.source} · fetched {day(UTILITY_META.fetchedAt)}
        </p>
      </section>

      {tractRow ? (
        <section aria-label="Selected tract" className="rounded-card border border-rule bg-paper p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-eyebrow uppercase text-ink-muted">Census tract {tractRow.geoid}</p>
            <button type="button" onClick={onClearTract} className="text-micro text-ink-muted underline underline-offset-2 hover:text-ink">
              Clear
            </button>
          </div>
          <p className="mt-1 text-micro text-ink-muted">
            {townsOfTract(tractRow.geoid).join(', ') || 'Massachusetts'}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Oil-heated share" value={tractRow.households > 0 ? pct(tractRow.oilShare) : 'No households'} />
            <Stat label="Oil-heated homes" value={int(tractRow.oilHouseholds)} />
            <Stat label="Occupied homes" value={int(tractRow.households)} />
            <Stat label="Median year built" value={tractRow.medianYearBuilt > 0 ? String(tractRow.medianYearBuilt) : 'No estimate'} />
          </dl>
        </section>
      ) : null}

      <section aria-label="Town heating fuel">
        <p className="text-eyebrow uppercase text-ink-muted">Heating oil in {town}</p>
        {households > 0 ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <Stat label="Oil-heated share" value={pct(oil / households)} />
            <Stat label="Oil-heated homes" value={int(oil)} />
          </dl>
        ) : (
          <p className="mt-1 text-small text-ink-muted">No tract estimates for this town.</p>
        )}
        <p className="mt-2 text-micro text-ink-faint">
          Sums the {rows.length} tracts that touch the town; a tract on a town line is counted whole in each town.
        </p>
      </section>

      <p className="text-micro text-ink-faint">
        {GEO_META.tractStats.source.split(' — ')[0]} · B25040 · fetched {day(GEO_META.tractStats.fetchedAt)}. {''}
        Estimates carry sampling error; read a small tract as a share.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="num text-body font-medium text-ink">{value}</dd>
    </div>
  )
}
