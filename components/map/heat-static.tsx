'use client'

/**
 * @built F-48 the static map fallback: a committed SVG plus the way to the table
 *
 * R10.1's failure path, without a phone-call to a tile server: if the basemap or the
 * tract chunk cannot load, the lens shows the same picture as a static image and
 * points at the numbers as text. The image is generated offline by
 * `scripts/bake-heat-svg.mjs` from the committed geometry and ACS table, so this
 * component fetches one same-origin file and nothing else.
 */

import { useEffect, useRef } from 'react'
import { stateHeatTotals, percent } from '@/lib/map/heat'

export interface HeatStaticProps {
  open: boolean
  onClose: () => void
  onTable: () => void
  /** Why the fallback opened, said out loud rather than left to the reader to guess. */
  reason: string | null
}

export function HeatStatic({ open, onClose, onTable, reason }: HeatStaticProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const totals = stateHeatTotals()

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => closeRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="heat-static-heading"
        className="flex max-h-[88%] w-full max-w-[760px] flex-col overflow-hidden rounded-t-card border border-rule bg-surface shadow-lg sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
          <div>
            <h2 id="heat-static-heading" className="text-title font-medium text-ink">
              Massachusetts heating oil, as a still image
            </h2>
            <p className="mt-0.5 text-micro text-ink-muted">
              {reason ?? 'A fixed picture of the same data, for when the interactive map cannot draw.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="h-8 shrink-0 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink hover:bg-paper-sunk"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a committed SVG fallback, nothing to optimise at runtime */}
          <img
            src="/data/ma-heat-map.png"
            alt={`Share of homes heating with oil by census tract. Statewide ${percent(totals.oilShare)} of ${totals.households.toLocaleString(
              'en-US',
            )} occupied homes; ${totals.oilHouseholds.toLocaleString('en-US')} heat with oil.`}
            className="w-full rounded-md border border-rule"
            width={960}
            height={600}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTable}
              className="h-9 rounded-md border border-ink bg-ink px-3 text-small font-medium text-paper hover:bg-ink-muted"
            >
              Open the table view
            </button>
            <p className="text-micro text-ink-muted">
              Every number in the picture is also text, with the town and the tract, in the table.
            </p>
          </div>
          <p className="mt-3 text-micro text-ink-faint">
            Shapes: US Census TIGERweb tracts. Values: ACS B25040 via Census Reporter. The image is generated from
            committed files by <span className="font-mono">scripts/bake-heat-svg.mjs</span>; the runtime makes no request
            for it beyond this one file.
          </p>
        </div>
      </div>
    </div>
  )
}
