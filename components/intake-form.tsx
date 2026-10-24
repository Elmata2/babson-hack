'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { AddressCombobox } from './address-combobox'
import { BillUpload } from './bill-upload'
import { FreshnessBadge } from './freshness-badge'
import { matchTown, type AddressSuggestion } from '@/lib/address/nominatim'
import type { BillFuel } from '@/lib/parse/types'

/**
 * @built F-30 manual entry — fuel and two numbers, the path that always works
 * @built F-31 address intake — geocode + assessor prefill, with per-field source
 * @built F-64 the address field is a type-ahead over OpenStreetMap, so "106 Chandler"
 * asks which one, instead of silently choosing
 * @built F-65 bill upload sits beside the numbers and fills them only on request
 *
 * The rule from the design: every server route is an enrichment. Delete all of
 * them and this form still produces a verdict, because the form is the product
 * and the network is a convenience. That is why the address is optional, why the
 * year built is editable after it arrives, and why every prefilled field says
 * where it came from.
 *
 * Nothing is submitted to a server: the numbers go into the URL of the verdict
 * screen, which is the only state this app has.
 */

const FUELS: { value: BillFuel; label: string; unit: string; short: string; hint: string }[] = [
  { value: 'oil', label: 'Heating oil', unit: 'gallons a year', short: 'gal', hint: 'Your delivery account shows a yearly total.' },
  { value: 'propane', label: 'Propane', unit: 'gallons a year', short: 'gal', hint: 'Summer fill plus winter deliveries.' },
  { value: 'gas', label: 'Natural gas', unit: 'therms a year', short: 'therms', hint: 'The annual summary on your gas bill.' },
  { value: 'resistance', label: 'Electric baseboard', unit: 'kWh a year', short: 'kWh', hint: 'Twelve months of bills, or your account total.' },
]

const TIERS: { value: string; label: string }[] = [
  { value: 'whole', label: 'Whole-home heat pump' },
  { value: 'partial', label: 'Partial-home (ducted + mini-splits)' },
  { value: 'basic', label: 'Basic / one unit' },
  { value: 'enhanced', label: 'Income-qualified enhanced' },
]

export interface IntakeFormProps {
  towns: readonly string[]
  prices: {
    mode: 'live' | 'partial' | 'snapshot'
    asOf: string
    oil: number
    propane: number
    elec: number
  }
}

type Source = 'assessor' | 'manual' | null

/** `106 CHANDLER ST` → `106`. Used to refuse a buffered parcel for the wrong house. */
function houseNumberOf(line: string): string | null {
  const match = /^\s*(\d+[A-Za-z-]?)\b/.exec(line)
  return match?.[1] ?? null
}

interface AddressState {
  status: 'idle' | 'loading' | 'found' | 'error'
  message: string | null
  matchedAddress: string | null
}

export function IntakeForm({ towns, prices }: IntakeFormProps) {
  const router = useRouter()
  const marketPrice: Partial<Record<BillFuel, number>> = {
    oil: prices.oil,
    propane: prices.propane,
    resistance: prices.elec,
  }

  const [lookup, setLookup] = useState<AddressState>({ status: 'idle', message: null, matchedAddress: null })
  const [town, setTown] = useState('')
  const [fuel, setFuel] = useState<BillFuel>('oil')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState(marketPrice.oil ? String(marketPrice.oil) : '')
  const [priceEdited, setPriceEdited] = useState(false)
  const [yearBuilt, setYearBuilt] = useState('')
  const [sqft, setSqft] = useState('')
  const [envelopeSource, setEnvelopeSource] = useState<Source>(null)
  const [envelopeMatch, setEnvelopeMatch] = useState<'exact' | 'buffered' | null>(null)
  const [tier, setTier] = useState('whole')
  const [installYear, setInstallYear] = useState<'2026' | '2027'>('2026')

  const fuelMeta = FUELS.find((entry) => entry.value === fuel) ?? FUELS[0]
  const townsKnown = towns.includes(town)
  const canSubmit = units.trim() !== '' && price.trim() !== '' && town !== '' && townsKnown

  function chooseFuel(next: BillFuel) {
    setFuel(next)
    if (!priceEdited) {
      const market = marketPrice[next]
      setPrice(market ? String(market) : '')
    }
  }

  /** Parcel prefill: year built and floor area, never a price. 4s abort inside the route. */
  async function prefillFromParcel(lat: number, lon: number, expectedHouse?: string | null) {
    const ask = async (buffer: number) => {
      const query = `lat=${lat}&lon=${lon}${buffer > 0 ? `&buffer=${buffer}` : ''}`
      const response = await fetch(`/api/parcel?${query}`)
      return (await response.json()) as {
        ok: boolean
        match?: 'exact' | 'buffered'
        parcel?: { yearBuilt: number | null; bldAreaSqft: number | null; siteAddr?: string }
      }
    }

    try {
      // Exact point first. A geocoded address point usually sits on the street
      // centreline, so a miss is normal; a 20m buffer finds the parcel, and only
      // counts when the house number agrees.
      let payload = await ask(0)
      let buffered = false
      if (!payload.ok || !payload.parcel) {
        payload = await ask(20)
        buffered = true
      }
      if (!payload.ok || !payload.parcel) return

      if (buffered) {
        const parcelHouse = houseNumberOf(payload.parcel.siteAddr ?? '')
        if (!expectedHouse || !parcelHouse || parcelHouse !== expectedHouse) return
      }

      if (payload.parcel.yearBuilt) {
        setYearBuilt(String(payload.parcel.yearBuilt))
        setEnvelopeSource('assessor')
        setEnvelopeMatch(buffered ? 'buffered' : 'exact')
      }
      if (payload.parcel.bldAreaSqft) setSqft(String(payload.parcel.bldAreaSqft))
    } catch {
      // The parcel record is a convenience. Its absence changes no number.
    }
  }

  /** A row from the OpenStreetMap dropdown: the house is already narrowed down. */
  async function handleSuggestion(suggestion: AddressSuggestion) {
    const local = matchTown(suggestion.town, towns)
    if (local) setTown(local)
    setLookup({ status: 'found', message: null, matchedAddress: suggestion.label })

    const [geo, parcel] = await Promise.allSettled([
      fetch(`/api/geocode?q=${encodeURIComponent(suggestion.label)}`).then((response) => response.json()),
      prefillFromParcel(suggestion.lat, suggestion.lon, houseNumberOf(suggestion.line1)),
    ])

    if (geo.status === 'fulfilled') {
      const result = geo.value as { ok?: boolean; town?: string; townKnown?: boolean; matchedAddress?: string; message?: string }
      if (result.ok && result.town && result.townKnown) {
        setTown(result.town)
        setLookup({ status: 'found', message: null, matchedAddress: result.matchedAddress ?? suggestion.label })
      } else if (!local) {
        setLookup({
          status: 'error',
          message: result.message ?? 'Matched, but the town is not a Massachusetts municipality. Pick it below.',
          matchedAddress: suggestion.label,
        })
      }
    }
    if (parcel.status === 'rejected' && !local) {
      setLookup((current) => ({
        ...current,
        message: 'Town unmatched — pick it from the list. Year built and area can be typed.',
      }))
    }
  }

  /** Typed address that the dropdown did not list: let the Census geocoder try it. */
  async function handleTypedAddress(query: string) {
    setLookup({ status: 'loading', message: null, matchedAddress: null })
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      const payload = (await response.json()) as {
        ok: boolean
        message?: string
        matchedAddress?: string
        lat?: number
        lon?: number
        town?: string
        townKnown?: boolean
      }

      if (!payload.ok || payload.lat === undefined || payload.lon === undefined) {
        setLookup({
          status: 'error',
          message: payload.message ?? 'That address did not match. Pick your town below instead.',
          matchedAddress: null,
        })
        return
      }

      if (payload.town && payload.townKnown) setTown(payload.town)
      setLookup({
        status: 'found',
        message: payload.townKnown ? null : 'Matched, but the town is not a Massachusetts municipality. Pick it below.',
        matchedAddress: payload.matchedAddress ?? null,
      })
      await prefillFromParcel(payload.lat, payload.lon)
    } catch {
      setLookup({
        status: 'error',
        message: 'The address lookup is unreachable. Pick your town below — the verdict does not need the coordinate.',
        matchedAddress: null,
      })
    }
  }

  function applyBill(values: { fuel: BillFuel; units: string; price: string }) {
    setFuel(values.fuel)
    setUnits(values.units)
    setPrice(values.price)
    setPriceEdited(true)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    const params = new URLSearchParams({
      fuel,
      units: units.trim().replace(/,/g, ''),
      price: price.trim().replace(/,/g, ''),
      town,
      tier,
      year: installYear,
    })
    if (yearBuilt.trim()) params.set('yb', yearBuilt.trim())
    if (sqft.trim()) params.set('sqft', sqft.trim().replace(/,/g, ''))
    if (envelopeSource) params.set('src', envelopeSource)
    router.push(`/verdict?${params.toString()}`)
  }

  const statusLine =
    town === ''
      ? 'Choose a town — the climate zone and the utility sponsor come from it.'
      : !townsKnown
        ? 'That town is not in the Massachusetts table. Pick it from the list.'
        : canSubmit
          ? 'Nothing is stored. The numbers travel in the link.'
          : 'Add the yearly total and the price you pay.'

  const summary =
    units.trim() !== '' && price.trim() !== '' && town !== ''
      ? `${units.trim()} ${fuelMeta.short} at $${price.trim()} · ${town}`
      : 'Two numbers, one town'

  return (
    <form onSubmit={submit} className="grid gap-8">
      {/* ---------------------------------------------------------- address */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-medium">1 · Where is the house?</h2>
          <span className="text-micro text-ink-muted">Optional — but it sets the climate and the utility.</span>
        </div>

        <AddressCombobox onSelect={(suggestion) => void handleSuggestion(suggestion)} onTyped={(value) => void handleTypedAddress(value)} />

        {lookup.matchedAddress ? (
          <p className="text-micro text-ink-muted">Census matched: {lookup.matchedAddress}</p>
        ) : null}
        {lookup.message ? <p className="text-micro text-deadline">{lookup.message}</p> : null}

        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <label className="grid gap-1.5 text-small">
            <span className="font-medium">Town</span>
            <select
              value={town}
              onChange={(event) => setTown(event.target.value)}
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
            >
              <option value="">Choose a town…</option>
              {towns.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-small">
            <span className="flex items-center justify-between gap-2 font-medium">
              Year built
              {envelopeSource ? (
                <FreshnessBadge
                  kind={envelopeSource}
                  label={
                    envelopeSource === 'assessor'
                      ? envelopeMatch === 'buffered'
                        ? 'Assessor (nearby)'
                        : 'Assessor'
                      : 'You'
                  }
                />
              ) : null}
            </span>
            <input
              value={yearBuilt}
              onChange={(event) => {
                setYearBuilt(event.target.value)
                setEnvelopeSource(event.target.value.trim() ? 'manual' : null)
                setEnvelopeMatch(null)
              }}
              inputMode="numeric"
              placeholder="e.g. 1952"
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
            />
          </label>

          <label className="grid gap-1.5 text-small">
            <span className="font-medium">Heated area (sqft)</span>
            <input
              value={sqft}
              onChange={(event) => setSqft(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1,600"
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
            />
          </label>
        </div>
        <p className="text-micro text-ink-faint">
          Year built and floor area are used only for the envelope fallback when a bill is missing. They never
          change a price.
        </p>
      </section>

      {/* ------------------------------------------------------------- bill */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-medium">2 · What do you burn, and how much?</h2>
          <FreshnessBadge kind={prices.mode === 'live' ? 'live' : 'snapshot'} date={prices.asOf} label="Prices" />
        </div>

        <BillUpload onApply={applyBill} />

        <div role="radiogroup" aria-label="Heating fuel" className="flex flex-wrap gap-2">
          {FUELS.map((entry) => {
            const active = entry.value === fuel
            return (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseFuel(entry.value)}
                className={`rounded-pill border px-3.5 py-1.5 text-small transition-colors ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                }`}
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-small">
            <span className="font-medium">How much? ({fuelMeta.unit})</span>
            <input
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              inputMode="decimal"
              placeholder={fuel === 'gas' ? '900' : fuel === 'resistance' ? '9,000' : '800'}
              aria-describedby="units-hint"
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
            />
            <span id="units-hint" className="text-micro text-ink-faint">
              {fuelMeta.hint}
            </span>
          </label>

          <label className="grid gap-1.5 text-small">
            <span className="font-medium">
              Price you pay{' '}
              <span className="text-ink-faint">
                ({fuel === 'gas' ? '$/therm' : fuel === 'resistance' ? '$/kWh' : '$/gal'})
              </span>
            </span>
            <input
              value={price}
              onChange={(event) => {
                setPrice(event.target.value)
                setPriceEdited(true)
              }}
              inputMode="decimal"
              placeholder={fuel === 'gas' ? '1.62' : undefined}
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
            />
            <span className="text-micro text-ink-faint">
              {fuel === 'gas'
                ? 'Natural gas is not in the public price feed — read it off your bill.'
                : marketPrice[fuel]
                  ? 'Prefilled from the dated public price. Overwrite it with your bill.'
                  : 'From your bill or delivery receipt.'}
            </span>
          </label>
        </div>
      </section>

      {/* ---------------------------------------------------------- upgrade */}
      <section className="grid gap-3">
        <h2 className="text-title font-medium">3 · What are you buying, and when?</h2>

        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
          <label className="grid gap-1.5 text-small">
            <span className="font-medium">Rebate tier</span>
            <select
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
            >
              {TIERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-1.5 text-small">
            <legend className="font-medium">Install year</legend>
            <div className="flex gap-2">
              {(['2026', '2027'] as const).map((year) => {
                const active = installYear === year
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setInstallYear(year)}
                    aria-pressed={active}
                    className={`flex-1 rounded-card border px-3 py-2.5 tabular-nums transition-colors ${
                      active
                        ? 'border-ink bg-ink text-paper'
                        : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                    }`}
                  >
                    {year}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>

        <p className="text-micro text-ink-faint">
          The whole-home rebate drops from $2,650 to $2,350 per ton on 1 January 2027. The verdict will say so in
          dollars, not adjectives.
        </p>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section className="rounded-card border border-rule bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="text-eyebrow uppercase text-ink-muted">Ready when you are</p>
            <p className="mt-2 text-title font-medium tabular-nums">{summary}</p>
            <p className="mt-1 max-w-[46ch] text-micro text-ink-muted">{statusLine}</p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="group inline-flex items-center gap-3 rounded-pill bg-ink px-6 py-3.5 text-small font-medium text-paper transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
          >
            See the verdict
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </section>
    </form>
  )
}
