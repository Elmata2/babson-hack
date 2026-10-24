'use client'

/**
 * @built F-47 the parallel table view: a real <table> with the same numbers, and the
 * keyboard path to a tract — Tab to the table, arrows between rows, Enter to select
 * @built F-48 county rows that are computed from the committed tables, so the table is
 * complete before a byte of geometry arrives and after a chunk or tile fails
 *
 * The map is not the only way in. Every figure the choropleth, the tooltip and the
 * tract panel show is printed here as text, in the same order, from the same
 * `lib/map/heat.ts` values. County rows first: R10.13 wants the map useful within two
 * seconds, and 14 county rows need no geometry, no tile and no network.
 *
 * Keyboard model: one tab stop (the table), arrow keys move the active row, Enter or
 * Space selects it. The active row carries `tabIndex=0` and the rest `-1`, so tabbing
 * out and back returns to where the reader was, not to the first of 1,620 rows.
 */

import { useEffect, useMemo, useState } from 'react'
import { displayTown } from '@/lib/geo'
import {
  ASSUMPTION_NOTE,
  CLIFF_SOURCE,
  OIL_PRICE_AS_OF,
  countyHeatRows,
  formatMillions,
  money,
  nextRowIndex,
  percent,
  stateHeatTotals,
  tableRows,
  tableRowsForTown,
  type HeatTableRow,
  type HeatYear,
} from '@/lib/map/heat'

export interface HeatTableProps {
  open: boolean
  onClose: () => void
  year: HeatYear
  /** Town in focus, so the tract table opens on the drill the user is in. */
  town: string | null
  /** Selected tract GEOID, so the row is marked and focused. */
  selected: string | null
  /** Select a tract: the same action a map click performs. */
  onSelect: (geoid: string, town: string | null) => void
}

const TOP = 50
const rowId = (index: number) => `heat-row-${index}`

export function HeatTable(props: HeatTableProps) {
  if (!props.open) return null
  return <HeatTableBody {...props} />
}

function HeatTableBody({ onClose, year, town, selected, onSelect }: HeatTableProps) {
  const [showAll, setShowAll] = useState(false)
  const counties = useMemo(() => countyHeatRows(), [])
  const state = useMemo(() => stateHeatTotals(), [])
  const rows = useMemo(
    () => (town ? tableRowsForTown(year, town) : tableRows(year, showAll ? undefined : TOP)),
    [town, year, showAll],
  )
  // Fresh on every open, because the body only mounts while the dialog is open.
  const [focus, setFocus] = useState(() => {
    const index = rows.findIndex((row) => row.geoid === selected)
    return index >= 0 ? index : 0
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const moveTo = (index: number) => {
    setFocus(index)
    // Focus follows the state change; the id is the only handle needed, so no refs.
    requestAnimationFrame(() => document.getElementById(rowId(index))?.focus())
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="heat-table-title"
        className="flex max-h-[88%] w-full max-w-[900px] flex-col overflow-hidden rounded-t-card border border-rule bg-surface shadow-lg sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
          <div>
            <h2 id="heat-table-title" className="text-title font-medium text-ink">
              Heating oil by census tract
            </h2>
            <p className="mt-0.5 text-micro text-ink-muted">
              {year === 2027 ? '2027: after the Jan 1 step-down' : '2026: before the step-down'} · same numbers as the map ·{' '}
              {town ? displayTown(town) : 'Massachusetts'}
            </p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-8 shrink-0 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink hover:bg-paper-sunk"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <section aria-labelledby="county-table-title">
            <h3 id="county-table-title" className="text-small font-medium text-ink">
              Counties
            </h3>
            <p className="mt-0.5 text-micro text-ink-muted">
              Works before the tract map loads, and after a failed tile or chunk load. The 14 rows sum to the state.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-micro">
                <caption className="sr-only">
                  Heating oil by county, {year}. Oil spend {ASSUMPTION_NOTE} at the DOER price of {OIL_PRICE_AS_OF}.
                </caption>
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th scope="col" className="border-b border-rule py-1 pr-2 font-medium">County</th>
                    <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Homes</th>
                    <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Oil share</th>
                    <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Homes on oil</th>
                    <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Oil spend</th>
                    <th scope="col" className="border-b border-rule py-1 pl-2 text-right font-medium">Lost on Jan 1 (up to)</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {counties.map((county) => (
                    <tr key={county.fips}>
                      <th scope="row" className="border-b border-rule/60 py-1 pr-2 text-left font-normal text-ink">
                        {county.name}
                      </th>
                      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">
                        {county.households.toLocaleString('en-US')}
                      </td>
                      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{percent(county.oilShare)}</td>
                      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">
                        {county.oilHouseholds.toLocaleString('en-US')}
                      </td>
                      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">
                        {formatMillions(county.oilSpendUsd)}
                      </td>
                      <td className="border-b border-rule/60 py-1 pl-2 text-right text-ink">
                        {year === 2027 ? formatMillions(county.cliffDollars) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <th scope="row" className="py-1 pr-2 text-left text-ink">Massachusetts</th>
                    <td className="px-2 py-1 text-right text-ink">{state.households.toLocaleString('en-US')}</td>
                    <td className="px-2 py-1 text-right text-ink">{percent(state.oilShare)}</td>
                    <td className="px-2 py-1 text-right text-ink">{state.oilHouseholds.toLocaleString('en-US')}</td>
                    <td className="px-2 py-1 text-right text-ink">{formatMillions(state.oilSpendUsd)}</td>
                    <td className="py-1 pl-2 text-right text-ink">{year === 2027 ? formatMillions(state.cliffDollars) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="tract-table-title" className="mt-5">
            <h3 id="tract-table-title" className="text-small font-medium text-ink">
              Tracts
            </h3>
            <p className="mt-0.5 text-micro text-ink-muted">
              {rows.length === 0
                ? 'Tract boundaries are still loading. The counties above are final.'
                : town
                  ? `The ${rows.length} tracts covering ${displayTown(town)}. Arrow keys move, Enter selects.`
                  : `${rows.length} tracts. Arrow keys move, Enter selects.`}
            </p>
            {rows.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-micro">
                  <caption className="sr-only">
                    Heating oil by census tract, {year}. Oil spend {ASSUMPTION_NOTE} at the DOER price of {OIL_PRICE_AS_OF}.{' '}
                    {CLIFF_SOURCE}.
                  </caption>
                  <thead>
                    <tr className="text-left text-ink-muted">
                      <th scope="col" className="border-b border-rule py-1 pr-2 font-medium">Tract</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 font-medium">Town</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Homes</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Oil share</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">On oil</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Oil spend</th>
                      <th scope="col" className="border-b border-rule px-2 py-1 text-right font-medium">Lost Jan 1</th>
                      <th scope="col" className="border-b border-rule py-1 pl-2 text-right font-medium">Built</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {rows.map((row, i) => (
                      <TractRow
                        key={row.geoid}
                        id={rowId(i)}
                        row={row}
                        year={year}
                        selected={row.geoid === selected}
                        tabIndex={i === focus ? 0 : -1}
                        onFocusRow={() => setFocus(i)}
                        onSelect={() => onSelect(row.geoid, row.towns[0] ?? null)}
                        onMove={(direction) => {
                          const next = nextRowIndex(rows.length, i, direction === 'down' ? 'ArrowDown' : 'ArrowUp')
                          if (next >= 0) moveTo(next)
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {!town && rows.length > 0 && !showAll ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 h-8 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink hover:bg-paper-sunk"
              >
                Show all 1,620 tracts
              </button>
            ) : null}
          </section>

          <p className="mt-4 text-micro text-ink-faint">
            ACS B25040 heating fuel and B25035 median year built. {ASSUMPTION_NOTE} at the DOER week of {OIL_PRICE_AS_OF}.{' '}
            {CLIFF_SOURCE}. Estimates carry sampling error; read a small tract as a share, not a count.
          </p>
        </div>
      </div>
    </div>
  )
}

function TractRow(props: {
  id: string
  row: HeatTableRow
  year: HeatYear
  selected: boolean
  tabIndex: number
  onFocusRow: () => void
  onSelect: () => void
  onMove: (direction: 'up' | 'down') => void
}) {
  const { row, year } = props
  return (
    <tr
      id={props.id}
      tabIndex={props.tabIndex}
      aria-selected={props.selected}
      onFocus={props.onFocusRow}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault()
          props.onMove('down')
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault()
          props.onMove('up')
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.onSelect()
        }
      }}
      onClick={props.onSelect}
      className={`cursor-pointer align-top focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
        props.selected ? 'bg-paper-sunk' : ''
      }`}
    >
      <th scope="row" className="border-b border-rule/60 py-1 pr-2 text-left font-normal text-ink">
        {row.geoid}
        {props.selected ? <span className="sr-only"> (selected)</span> : null}
      </th>
      <td className="border-b border-rule/60 px-2 py-1 text-ink-muted">{row.towns.map(displayTown).join(', ') || '—'}</td>
      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{row.households.toLocaleString('en-US')}</td>
      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{percent(row.oilShare)}</td>
      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{row.oilHouseholds.toLocaleString('en-US')}</td>
      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{money(row.oilSpendUsd)}</td>
      <td className="border-b border-rule/60 px-2 py-1 text-right text-ink">{year === 2027 ? money(row.cliffDollars) : '—'}</td>
      <td className="border-b border-rule/60 py-1 pl-2 text-right text-ink">
        {row.medianYearBuilt > 0 ? row.medianYearBuilt : 'No estimate'}
      </td>
    </tr>
  )
}
