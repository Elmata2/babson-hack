'use client'

import { useRef, useState } from 'react'

import type { BillFuel } from '@/lib/parse/types'

/**
 * @built F-65 bill upload side panel — the photo path, with no dead end
 *
 * Sends one image to `/api/parse-bill`, shows exactly what came back, and only
 * fills the form when the person presses "Use these numbers". The image is never
 * previewed, kept or re-uploaded: the server reads it in memory and discards it,
 * and so does this component.
 *
 * If OCR is unconfigured or the document defeats it, the panel says so and points
 * at the two inputs below. That is the whole failure story.
 */

const FUEL_VALUES: readonly BillFuel[] = ['oil', 'propane', 'gas', 'resistance']

/** The subset of the response this panel needs. Deliberately loose: the parse
 *  module owns its shape, and a field rename here must not break the upload. */
interface ParsedBillView {
  fuel?: string | null
  units?: { value?: number | null; derived?: boolean; unit?: string }
  price?: { value?: number | null; unit?: string }
  confidence?: string
  ready?: boolean
  flags?: { field?: string; message?: string }[]
}

type Status = 'idle' | 'reading' | 'ready' | 'error'

export interface BillUploadProps {
  onApply: (values: { fuel: BillFuel; units: string; price: string; note: string }) => void
}

export function BillUpload({ onApply }: BillUploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [bill, setBill] = useState<ParsedBillView | null>(null)
  const [applied, setApplied] = useState(false)

  async function upload(file: File) {
    setStatus('reading')
    setMessage(null)
    setBill(null)
    setApplied(false)

    const body = new FormData()
    body.append('file', file)

    try {
      const response = await fetch('/api/parse-bill', { method: 'POST', body })
      const payload = (await response.json()) as
        | { ok: true; bill: ParsedBillView }
        | { ok: false; message?: string }

      if (!payload.ok) {
        setStatus('error')
        setMessage(payload.message ?? 'That document could not be read. Type the two numbers below instead.')
        return
      }

      setBill(payload.bill)
      setStatus('ready')
    } catch {
      setStatus('error')
      setMessage('The upload did not reach the reader. Type the two numbers below instead.')
    }
  }

  function apply() {
    if (!bill) return
    const fuel = FUEL_VALUES.find((value) => value === bill.fuel) ?? null
    const units = bill.units?.value
    const price = bill.price?.value
    if (!fuel || units === null || units === undefined || price === null || price === undefined) return

    onApply({
      fuel,
      units: String(units),
      price: String(price),
      note: bill.units?.derived ? 'annualised from a monthly bill' : 'read from the document',
    })
    setApplied(true)
  }

  const canApply =
    bill !== null &&
    FUEL_VALUES.some((value) => value === bill.fuel) &&
    typeof bill.units?.value === 'number' &&
    typeof bill.price?.value === 'number'

  return (
    <div className="rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">Or read the bill</p>
          <p className="mt-1 max-w-[38ch] text-small text-ink">
            Photograph an oil delivery receipt or a utility bill. We read six fields and throw the image away.
          </p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={status === 'reading'}
          className="rounded-card border border-rule-strong bg-surface px-3 py-2 text-small font-medium text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {status === 'reading' ? 'Reading…' : 'Upload a photo'}
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          event.target.value = ''
        }}
      />

      {status === 'error' && message ? (
        <p className="mt-3 text-micro text-deadline">{message}</p>
      ) : null}

      {status === 'ready' && bill ? (
        <div className="mt-3 grid gap-2 border-t border-rule pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-micro">
            <Chip label="Fuel" value={bill.fuel ?? 'not legible'} />
            <Chip
              label={bill.units?.unit ?? 'per year'}
              value={typeof bill.units?.value === 'number' ? bill.units.value.toLocaleString('en-US') : 'not legible'}
            />
            <Chip
              label={bill.price?.unit ?? '$/unit'}
              value={typeof bill.price?.value === 'number' ? `$${bill.price.value.toFixed(2)}` : 'not legible'}
            />
            <Chip label="Confidence" value={bill.confidence ?? 'unknown'} />
          </div>

          {bill.flags?.length ? (
            <ul className="grid gap-1 text-micro text-ink-muted">
              {bill.flags.map((flag, index) => (
                <li key={`${flag.field ?? 'flag'}-${index}`}>{flag.message}</li>
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
              {bill.ready === false
                ? 'The reader is unsure — check both numbers after they land.'
                : 'Nothing is stored; re-upload if you change your mind.'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-pill border border-rule bg-surface px-2 py-0.5">
      <span className="text-ink-faint">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </span>
  )
}
