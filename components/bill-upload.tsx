'use client'

import { useRef, useState } from 'react'

import type { BillFuel, BillParse } from '@/lib/parse/types'

/**
 * @built F-29 bill confirm UI — editable fields, confidence colours, and the
 * annualisation named instead of implied
 * @built F-65 bill upload side panel — one photo in, eleven fields out, no dead end
 *
 * The contract this screen renders (F-76/F-77): a bill is not "a number". It is a
 * document that covered some period, plus a named method that turned that period
 * into a heating year, with the assumptions that method needed. So the panel
 * shows `annualisation.method`, its note, its assumptions and its confidence —
 * never a bare annual figure.
 *
 * When there is no year to show, the screen asks for the missing fact instead of
 * inventing one:
 *   - `needs_fills`  → a 2–8 fills input, and the same photo is re-read with the
 *                      household's own cadence (tank_cadence)
 *   - `summer_month` → a May–September heating bill cannot describe a winter; ask
 *                      for a winter document
 *   - `partial_period` → one delivery, or an unreadable period; ask for the year
 * `stale_price` never blocks: last winter's oil really was $3.55/gal, so the
 * number stays and the DOER date is printed next to it.
 *
 * The image is never previewed, stored, or sent anywhere but this app's own
 * route, and it is only kept in memory so a re-read with a fill count needs no
 * second upload.
 */

const FUEL_VALUES: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']

const FUEL_LABEL: Record<BillFuel, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

const UNIT_BY_FUEL: Record<BillFuel, string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therms',
  resistance: 'kWh',
}

/** Plain English for the five methods, in the order `annualise` tries them. */
const METHOD_LABEL: Record<string, string> = {
  printed_history: 'Twelve months printed on the document',
  degree_days: 'Degree-day ratio from the ticket',
  tank_cadence: 'Your own fill count',
  hdd_scaled: 'One winter month, scaled by its share of the heating year',
  monthly_x12: 'Flat × 12',
}

const DOCUMENT_LABEL: Record<string, string> = {
  oil_delivery: 'Oil delivery receipt',
  propane_delivery: 'Propane delivery receipt',
  electric_bill: 'Electric bill',
  gas_bill: 'Gas bill',
  unknown: 'Unclassified document',
}

/** Questions that want an answer, not an error. */
const QUESTION_CODES = new Set(['needs_fills', 'summer_month', 'partial_period'])

/** Doubts that must be visible but must never stop the numbers being used. */
const NOTICE_CODES = new Set(['stale_price', 'low_confidence', 'annualised'])

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'text-switch border-switch-edge bg-switch-tint',
  medium: 'text-deadline border-deadline-edge bg-deadline-tint',
  low: 'text-hold border-hold-edge bg-hold-tint',
}

type Status = 'idle' | 'reading' | 'confirm' | 'error'

export interface BillUploadProps {
  onApply: (values: { fuel: BillFuel; units: string; price: string; note: string }) => void
}

export function BillUpload({ onApply }: BillUploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [bill, setBill] = useState<BillParse | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fills, setFills] = useState('')
  const [fuel, setFuel] = useState<BillFuel | ''>('')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [applied, setApplied] = useState(false)

  async function read(nextFile: File, deliveriesPerSeason?: number) {
    setStatus('reading')
    setMessage(null)
    setApplied(false)

    const body = new FormData()
    body.append('file', nextFile)
    if (deliveriesPerSeason !== undefined) body.append('deliveriesPerSeason', String(deliveriesPerSeason))

    try {
      const response = await fetch('/api/parse-bill', { method: 'POST', body })
      const payload = (await response.json()) as
        | { ok: true; bill: BillParse }
        | { ok: false; message?: string }

      if (!payload.ok) {
        setStatus('error')
        setMessage(payload.message ?? 'That document could not be read. Type the two numbers below instead.')
        return
      }

      const parsed = payload.bill
      setBill(parsed)
      setFile(nextFile)
      setFuel(parsed.fuel ?? '')
      setUnits(parsed.units.value === null ? '' : String(parsed.units.value))
      setPrice(parsed.price.value === null ? '' : String(parsed.price.value))
      setStatus('confirm')
    } catch {
      setStatus('error')
      setMessage('The upload did not reach the reader. Type the two numbers below instead.')
    }
  }

  function reRead() {
    const count = Number(fills)
    if (!file) return
    if (!Number.isInteger(count) || count < 2 || count > 8) {
      setMessage('A heating season is between 2 and 8 fills. Enter a whole number in that range.')
      return
    }
    setMessage(null)
    void read(file, count)
  }

  function apply() {
    if (!bill) return
    const nextFuel = FUEL_VALUES.find((value) => value === fuel)
    const nextUnits = Number(units.replace(/,/g, ''))
    const nextPrice = Number(price.replace(/,/g, ''))
    if (!nextFuel || !Number.isFinite(nextUnits) || nextUnits <= 0 || !Number.isFinite(nextPrice) || nextPrice <= 0) {
      return
    }

    onApply({
      fuel: nextFuel,
      units: String(nextUnits),
      price: String(nextPrice),
      note: bill.annualisation?.note ?? 'read straight off the document',
    })
    setApplied(true)
  }

  const canApply =
    FUEL_VALUES.some((value) => value === fuel) &&
    Number(units.replace(/,/g, '')) > 0 &&
    Number(price.replace(/,/g, '')) > 0

  const question = bill?.flags.find((flag) => QUESTION_CODES.has(flag.code)) ?? null
  const notices = bill?.flags.filter((flag) => NOTICE_CODES.has(flag.code)) ?? []
  const others = bill?.flags.filter((flag) => !QUESTION_CODES.has(flag.code) && !NOTICE_CODES.has(flag.code)) ?? []

  return (
    <div className="rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">Or read the bill</p>
          <p className="mt-1 max-w-[42ch] text-small text-ink">
            Photograph an oil delivery receipt or a utility bill. We read eleven fields, name how the year was
            worked out, and throw the image away.
          </p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={status === 'reading'}
          className="rounded-card border border-rule-strong bg-surface px-3 py-2 text-small font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {status === 'reading' ? 'Reading…' : bill ? 'Upload another' : 'Upload a photo'}
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          if (chosen) void read(chosen)
          event.target.value = ''
        }}
      />

      {status === 'error' && message ? <p className="mt-3 text-micro text-deadline">{message}</p> : null}

      {status === 'confirm' && bill ? (
        <div className="mt-3 grid gap-3 border-t border-rule pt-3">
          {/* what the document is */}
          <div className="flex flex-wrap items-center gap-2 text-micro">
            <span className="rounded-pill border border-rule bg-surface px-2 py-0.5 text-ink">
              {DOCUMENT_LABEL[bill.documentType ?? 'unknown'] ?? 'Document'}
            </span>
            {bill.documentDate ? <span className="text-ink-muted">{bill.documentDate}</span> : null}
            {bill.rateClass ? <span className="text-ink-muted">rate class {bill.rateClass}</span> : null}
            <span
              className={`ml-auto rounded-pill border px-2 py-0.5 font-medium ${
                CONFIDENCE_TONE[bill.confidence] ?? CONFIDENCE_TONE.low
              }`}
            >
              {bill.confidence} confidence
            </span>
          </div>

          {/* editable fields */}
          <div className="grid gap-2 sm:grid-cols-[1.1fr_1fr_1fr]">
            <label className="grid gap-1 text-micro">
              <span className="text-ink-muted">Fuel</span>
              <select
                value={fuel}
                onChange={(event) => setFuel(event.target.value as BillFuel | '')}
                className="rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small"
              >
                <option value="">Not legible</option>
                {FUEL_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {FUEL_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-micro">
              <span className="text-ink-muted">
                Annual units {fuel ? `(${UNIT_BY_FUEL[fuel]} a year)` : ''}
              </span>
              <input
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                inputMode="decimal"
                placeholder="not legible"
                className="rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small tabular-nums"
              />
            </label>

            <label className="grid gap-1 text-micro">
              <span className="text-ink-muted">Price {fuel ? `($/${UNIT_BY_FUEL[fuel]})` : ''}</span>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="not legible"
                className="rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small tabular-nums"
              />
            </label>
          </div>

          {/* how the year was worked out */}
          {bill.annualisation ? (
            <div className="rounded-card border border-rule bg-surface p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-micro font-medium text-ink">
                  {METHOD_LABEL[bill.annualisation.method] ?? bill.annualisation.method}
                </p>
                <span
                  className={`rounded-pill border px-2 py-0.5 text-[11px] font-medium ${
                    CONFIDENCE_TONE[bill.annualisation.confidence >= 0.8 ? 'high' : bill.annualisation.confidence >= 0.55 ? 'medium' : 'low']
                  }`}
                >
                  {Math.round(bill.annualisation.confidence * 100)}% on this method
                </span>
              </div>
              <p className="mt-1 text-micro text-ink-muted">{bill.annualisation.note}</p>
              {bill.annualisation.assumptions.length ? (
                <ul className="mt-1.5 grid gap-0.5 text-micro text-ink-faint">
                  {bill.annualisation.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : bill.units.value !== null ? (
            <p className="text-micro text-ink-muted">
              Nothing was multiplied: the document already covers a full heating year.
            </p>
          ) : null}

          {/* questions, not errors */}
          {question ? (
            <div className="rounded-card border border-rule bg-surface p-3">
              <p className="text-small text-ink">{question.message}</p>

              {question.code === 'needs_fills' ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-micro">
                    <span className="text-ink-muted">Fills per heating season (2–8)</span>
                    <input
                      value={fills}
                      onChange={(event) => setFills(event.target.value)}
                      inputMode="numeric"
                      placeholder="3"
                      className="w-24 rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={reRead}
                    className="rounded-card border border-rule-strong px-3 py-1.5 text-micro font-medium text-ink hover:border-ink"
                  >
                    Work out the year
                  </button>
                </div>
              ) : null}

              {message ? <p className="mt-2 text-micro text-deadline">{message}</p> : null}
            </div>
          ) : null}

          {/* doubts that do not block */}
          {notices.length || others.length ? (
            <ul className="grid gap-1 text-micro text-ink-muted">
              {[...notices, ...others].map((flag, index) => (
                <li key={`${flag.field}-${flag.code}-${index}`}>{flag.message}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={!canApply || applied}
              className="rounded-card bg-ink px-3 py-1.5 text-micro font-medium text-paper disabled:opacity-40"
            >
              {applied ? 'Applied to the form' : 'Use these numbers'}
            </button>
            <span className="text-micro text-ink-faint">
              {bill.ready
                ? 'Every number above is editable before it reaches the calculator.'
                : 'Check the flagged numbers — the form takes whatever you leave.'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
