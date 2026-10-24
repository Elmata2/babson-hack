'use client'

import { useRef, useState } from 'react'

import {
  UNIT_BY_FUEL,
  buildApplied,
  evaluateBill,
  formatAmount,
  formatPrice,
  hasQuestion,
  messageForNonJson,
  methodPhrase,
  withFills,
  type CheckField,
  type ParsedBill,
} from '@/lib/client/bill-confirm'
import { prepareUploadFiles } from '@/lib/client/prepare-image'
import type { BillApplied, BillRole } from '@/lib/parse/contract'
import type { BillFuel } from '@/lib/parse/types'

/**
 * @built F-29 bill confirm UI — editable fields, confidence colours, and the
 * annualisation named instead of implied
 * @built F-65 bill upload side panel — one photo in, the fields out, no dead end
 * @built F-107 client image prep — photos are shrunk in the browser before upload
 * @built F-108 multi-page upload (up to 3), camera-first button, county + heating sent
 * @built F-109 confirm panel rewrite — "Here's what we found", touch-to-confirm
 * for shaky fields, auto-apply when clean, Undo, and an electric-bill follow-up
 *
 * A bill is not "a number". It is a document that covered some period, plus a
 * named method that turned that period into a heating year. The card therefore
 * shows the method in plain words next to the yearly amount, and keeps the
 * assumptions one click away under "How we got this number".
 *
 * Trust rules (requirements R2.4):
 *   - a field the validator is unsure of gets a dotted outline and "check?" and
 *     blocks "Use these numbers" until it is edited or confirmed
 *   - a clean parse applies itself; "Undo" takes it back
 *   - a question (`needs_fills`, summer bill) is asked, never papered over
 *
 * The image is never previewed or stored; it goes to this app's own route only.
 */

const FUEL_VALUES: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']

const FUEL_LABEL: Record<BillFuel, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

const FUEL_NOUN: Record<BillFuel, string> = {
  oil: 'Oil',
  propane: 'Propane',
  gas: 'Gas',
  resistance: 'Electricity',
}

const UTILITY_LABEL: Record<string, string> = {
  eversource: 'Eversource',
  national_grid: 'National Grid',
  unitil: 'Unitil',
  liberty: 'Liberty',
  berkshire_gas: 'Berkshire Gas',
  municipal: 'Municipal light plant',
  oil_dealer: 'Oil dealer',
  propane_dealer: 'Propane dealer',
  other: 'Other supplier',
}

type Status = 'idle' | 'reading' | 'confirm' | 'error'

export interface BillSampleSource {
  id: string
  /** Short button label. */
  label: string
  /** What this sample proves; used as the button's title. */
  note?: string
  /** Same-origin path to the image. */
  url: string
  /** Which slot the sample belongs to. Omitted means the heating slot. */
  role?: BillRole
}

export interface BillUploadProps {
  /** Receives exactly one `BillApplied` per bill. Called again if the person edits and re-applies. */
  onApply: (applied: BillApplied) => void
  /** The person took an applied bill back. The form should clear what that bill filled in. */
  onUndo?: (role: BillRole) => void
  /** 5-digit MA county FIPS (25001–25027) of the chosen town; shapes the heating year. */
  countyFips?: string
  /** Whether the fuel on this document is the home's heat source. Default: let the reader decide. */
  heating?: boolean
  /** Which bill this instance asks for. `electricity` is the optional second bill. Default `heating`. */
  expect?: BillRole
  /**
   * Synthetic sample bills (F-80) offered under the buttons, filtered by `role`.
   * A demo affordance only: they travel the same `read()` path as a real photo.
   */
  samples?: readonly BillSampleSource[]
}

/** Dotted outline + "check?" on a field that still needs a human. */
function fieldShell(needsCheck: boolean): string {
  return needsCheck ? 'rounded-card border border-dotted border-deadline bg-deadline-tint/40 p-2' : 'p-2'
}

export function BillUpload({ onApply, onUndo, countyFips, heating, expect = 'heating', samples = [] }: BillUploadProps) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [bill, setBill] = useState<ParsedBill | null>(null)
  const [fills, setFills] = useState('')
  const [fuel, setFuel] = useState<BillFuel | ''>('')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [unitsEdited, setUnitsEdited] = useState(false)
  const [touched, setTouched] = useState<ReadonlySet<CheckField>>(new Set())
  const [applied, setApplied] = useState<'no' | 'auto' | 'manual'>('no')
  const [showElectric, setShowElectric] = useState(false)
  const [sampleId, setSampleId] = useState<string | null>(null)

  const electricInstance = expect === 'electricity'

  function touch(field: CheckField) {
    setTouched((previous) => new Set(previous).add(field))
  }

  function emit(source: ParsedBill, nextFuel: BillFuel | '', nextUnits: string, nextPrice: string, edited: boolean) {
    const result = buildApplied({ bill: source, fuel: nextFuel, units: nextUnits, price: nextPrice, unitsEdited: edited })
    if (!result) return false
    onApply(result)
    return true
  }

  function show(parsed: ParsedBill) {
    const nextFuel = parsed.fuel ?? ''
    const nextUnits = parsed.units.value === null ? '' : formatAmount(parsed.units.value)
    const nextPrice = parsed.price.value === null ? '' : formatPrice(parsed.price.value)
    setBill(parsed)
    setFuel(nextFuel)
    setUnits(nextUnits)
    setPrice(nextPrice)
    setUnitsEdited(false)
    setTouched(new Set())
    setStatus('confirm')

    // A clean parse needs no click. "Undo" stays visible.
    if (evaluateBill(parsed).autoApply && emit(parsed, nextFuel, nextUnits, nextPrice, false)) {
      setApplied('auto')
    } else {
      setApplied('no')
    }
  }

  async function read(chosen: File[]) {
    setStatus('reading')
    setMessage(null)
    setApplied('no')

    // Render PDF pages and shrink photos locally before sending JPEGs to the reader.
    let prepared: File[]
    try {
      prepared = await prepareUploadFiles(chosen)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'That document could not be prepared. Try a photo instead.')
      return
    }

    const body = new FormData()
    for (const file of prepared) body.append('file', file)
    if (countyFips) body.append('countyFips', countyFips)
    const heatingFlag = electricInstance ? false : heating
    if (heatingFlag !== undefined) body.append('heating', String(heatingFlag))

    let response: Response
    try {
      response = await fetch('/api/parse-bill', { method: 'POST', body })
    } catch {
      setStatus('error')
      setMessage('We could not reach the reader — check your connection and try again, or type the two numbers.')
      return
    }

    let payload: { ok: true; bill: ParsedBill } | { ok: false; message?: string }
    try {
      payload = (await response.json()) as typeof payload
    } catch {
      // 413 / 504 from the platform arrive as HTML, not our JSON envelope.
      setStatus('error')
      setMessage(messageForNonJson(response.status))
      return
    }

    if (!payload.ok) {
      setStatus('error')
      setMessage(payload.message ?? 'That document could not be read. Type the two numbers instead.')
      return
    }

    show(payload.bill)
  }

  function submitFills() {
    const count = Number(fills)
    if (!bill) return
    if (!Number.isInteger(count) || count < 2 || count > 8) {
      setMessage('A heating season is between 2 and 8 fills. Enter a whole number in that range.')
      return
    }
    setMessage(null)
    const next = withFills(bill, count, countyFips)
    if (typeof next === 'string') setMessage(next)
    else show(next)
  }

  function applyNow() {
    if (!bill) return
    if (emit(bill, fuel, units, price, unitsEdited)) setApplied('manual')
  }

  function undo() {
    if (!bill) return
    setApplied('no')
    onUndo?.(bill.role ?? 'heating')
  }

  const evaluation = bill ? evaluateBill(bill) : null
  const outstanding = evaluation ? evaluation.checks.filter((field) => !touched.has(field)) : []
  const role: BillRole = bill?.role ?? expect
  const electricityRole = role === 'electricity'
  const unit = electricityRole ? 'kWh' : fuel ? UNIT_BY_FUEL[fuel] : 'units'
  const noun = electricityRole ? 'Electricity' : fuel ? FUEL_NOUN[fuel] : 'Fuel'
  const canApply =
    outstanding.length === 0 &&
    Number(price.replace(/,/g, '')) > 0 &&
    (electricityRole || (FUEL_VALUES.some((value) => value === fuel) && Number(units.replace(/,/g, '')) > 0))
  const question = bill && hasQuestion(bill) ? (bill.flags.find((flag) => flag.code === 'needs_fills' || flag.code === 'summer_month' || flag.code === 'partial_period') ?? null) : null
  const detailFlags = bill?.flags.filter((flag) => flag !== question) ?? []
  const place = [bill?.serviceTown, bill?.serviceZip].filter(Boolean).join(' ')
  const utilityLabel = bill?.utility ? (UTILITY_LABEL[bill.utility] ?? bill.utility) : null
  const method = bill ? methodPhrase(bill, Number(fills) || null) : ''

  const buttonBase =
    'rounded-card border px-3 py-2 text-small font-medium transition-colors disabled:opacity-50'
  const busy = status === 'reading'

  function chosen(list: FileList | null) {
    const picked = list ? Array.from(list) : []
    if (picked.length) void read(picked)
  }

  /** Fetch a synthetic sample and hand it to the same reader as a photo. */
  async function loadSample(sample: BillSampleSource) {
    setSampleId(sample.id)
    setStatus('reading')
    setMessage(null)
    try {
      const response = await fetch(sample.url)
      if (!response.ok) throw new Error('missing')
      const blob = await response.blob()
      const name = sample.url.split('/').pop() ?? `${sample.id}.png`
      const file = new File([blob], name, { type: blob.type || 'image/png' })
      await read([file])
    } catch {
      setStatus('error')
      setMessage('That sample bill could not be loaded. Try again, or upload your own photo.')
    } finally {
      setSampleId(null)
    }
  }

  const shownSamples = samples.filter((sample) => (sample.role ?? 'heating') === expect)

  return (
    <div className="rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-4">
      <div>
        <p className="text-eyebrow uppercase text-ink-muted">
          {electricInstance ? 'Your electric bill' : 'Start with a bill'}
        </p>
        <p className="mt-1 max-w-[46ch] text-small text-ink">
          {electricInstance
            ? 'Your electric bill gives us your real price per kWh and your utility.'
            : 'Photograph your oil receipt or gas or electric bill. Up to three pages are fine. We read it, show you what we found, and throw the image away.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={busy}
            className={`${buttonBase} border-ink bg-ink text-paper`}
          >
            {busy ? 'Reading…' : bill ? 'Take another photo' : 'Take a photo of your bill'}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className={`${buttonBase} border-rule-strong bg-surface text-ink hover:border-ink`}
          >
            Upload PDF or photos
          </button>
        </div>

        {shownSamples.length ? (
          <div className="mt-3 border-t border-rule pt-2.5">
            <p className="text-micro text-ink-faint">
              No bill to hand? Load a synthetic sample — not a real household&rsquo;s bill.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {shownSamples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => void loadSample(sample)}
                  disabled={busy}
                  title={sample.note}
                  className="rounded-pill border border-rule-strong bg-surface px-2.5 py-1 text-micro text-ink hover:border-ink disabled:opacity-50"
                >
                  {sampleId === sample.id ? 'Loading…' : sample.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Camera-first on phones; desktops fall back to the file picker. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          chosen(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          chosen(event.target.files)
          event.target.value = ''
        }}
      />

      <div aria-live="polite">
        {status === 'error' && message ? <p className="mt-3 text-micro text-deadline">{message}</p> : null}
      </div>

      {status === 'confirm' && bill ? (
        <div className="mt-3 grid gap-3 border-t border-rule pt-3">
          <p className="text-small font-medium text-ink">Here’s what we found</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {/* fuel */}
            <div className={fieldShell(outstanding.includes('fuel'))}>
              {electricityRole ? (
                <p className="text-small text-ink">Electricity — not your heat source</p>
              ) : (
                <label className="grid gap-1 text-micro">
                  <span className="text-ink-muted">Fuel</span>
                  <select
                    value={fuel}
                    onChange={(event) => {
                      setFuel(event.target.value as BillFuel | '')
                      touch('fuel')
                    }}
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
              )}
              {outstanding.includes('fuel') ? <CheckChip onConfirm={() => touch('fuel')} /> : null}
            </div>

            {/* who and where */}
            {utilityLabel || place ? (
              <div className="p-2 text-small text-ink">
                <p className="text-micro text-ink-muted">Utility and address area</p>
                <p>{[utilityLabel, place].filter(Boolean).join(' · ')}</p>
              </div>
            ) : null}

            {/* yearly amount */}
            <div className={fieldShell(outstanding.includes('units'))}>
              <label className="grid gap-1 text-micro">
                <span className="text-ink-muted">
                  {noun} used in a year ({unit})
                </span>
                <input
                  value={units}
                  onChange={(event) => {
                    setUnits(event.target.value)
                    setUnitsEdited(true)
                    touch('units')
                  }}
                  inputMode="decimal"
                  placeholder="not legible"
                  className="rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small tabular-nums"
                />
              </label>
              <p className="mt-1 text-micro text-ink-muted">{method}</p>
              {!electricityRole && bill.baseloadAnnual ? (
                <p className="text-micro text-ink-muted">
                  We’ll leave out about {formatAmount(bill.baseloadAnnual)} {unit} of year-round use (hot water,
                  cooking).
                </p>
              ) : null}
              {outstanding.includes('units') ? <CheckChip onConfirm={() => touch('units')} /> : null}
            </div>

            {/* all-in price */}
            <div className={fieldShell(outstanding.includes('price'))}>
              <label className="grid gap-1 text-micro">
                <span className="text-ink-muted">
                  What you pay per {unit === 'units' ? 'unit' : unit.replace(/s$/, '')} (all charges ÷ {unit})
                </span>
                <input
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value)
                    touch('price')
                  }}
                  inputMode="decimal"
                  placeholder="not legible"
                  className="rounded-card border border-rule-strong bg-surface px-2 py-1.5 text-small tabular-nums"
                />
              </label>
              <p className="mt-1 text-micro text-ink-muted">Total ÷ usage, so it includes delivery and fees.</p>
              {outstanding.includes('price') ? <CheckChip onConfirm={() => touch('price')} /> : null}
            </div>

            {/* rate class */}
            {bill.rateClassV3 || bill.lowIncomeSignal ? (
              <div className="p-2 text-small text-ink sm:col-span-2">
                {bill.rateClassV3 ? <span>Rate class {bill.rateClassV3}</span> : null}
                {bill.lowIncomeSignal ? (
                  <span className="text-ink-muted">
                    {bill.rateClassV3 ? ' · ' : ''}Looks like a discount rate — we’ll check what that unlocks.
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

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
                    onClick={submitFills}
                    className="rounded-card border border-rule-strong px-3 py-1.5 text-micro font-medium text-ink hover:border-ink"
                  >
                    Work out the year
                  </button>
                </div>
              ) : null}
              {message ? <p className="mt-2 text-micro text-deadline">{message}</p> : null}
            </div>
          ) : null}

          <details className="text-micro text-ink-muted">
            <summary className="cursor-pointer text-ink">How we got this number</summary>
            <div className="mt-2 grid gap-1">
              {bill.annualisation ? (
                <>
                  <p>{bill.annualisation.note}</p>
                  {bill.annualisation.assumptions.length ? (
                    <ul className="grid gap-0.5 text-ink-faint">
                      {bill.annualisation.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p>Nothing was multiplied: the document already covers a full year.</p>
              )}
              {detailFlags.map((flag, index) => (
                <p key={`${flag.field}-${flag.code}-${index}`}>{flag.message}</p>
              ))}
              <p className="text-ink-faint">Reader confidence: {bill.confidence}.</p>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {applied === 'no' ? (
              <>
                <button
                  type="button"
                  onClick={applyNow}
                  disabled={!canApply}
                  className="rounded-card bg-ink px-3 py-1.5 text-micro font-medium text-paper disabled:opacity-40"
                >
                  Use these numbers
                </button>
                <span className="text-micro text-ink-faint">
                  {outstanding.length
                    ? 'Check the dotted fields first — edit them or tap “check?”.'
                    : 'Every number above is editable first.'}
                </span>
              </>
            ) : (
              <>
                <span className="text-micro font-medium text-switch">
                  {applied === 'auto' ? 'Filled in from your bill' : 'Applied to the form'}
                </span>
                <button type="button" onClick={undo} className="text-micro text-ink-muted underline">
                  Undo
                </button>
              </>
            )}
          </div>

          {applied !== 'no' && !electricInstance && role === 'heating' ? (
            showElectric ? (
              <BillUpload expect="electricity" heating={false} countyFips={countyFips} onApply={onApply} onUndo={onUndo} samples={samples} />
            ) : (
              <button
                type="button"
                onClick={() => setShowElectric(true)}
                className="justify-self-start text-micro font-medium text-ink underline"
              >
                + Add your electric bill
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CheckChip({ onConfirm }: { onConfirm: () => void }) {
  return (
    <button
      type="button"
      onClick={onConfirm}
      className="mt-1 rounded-pill border border-dotted border-deadline px-2 py-0.5 text-[11px] font-medium text-deadline"
    >
      check? tap if this is right
    </button>
  )
}
