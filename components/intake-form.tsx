'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { FreshnessBadge } from './freshness-badge'
import type { BillFuel } from '@/lib/parse/types'

/**
 * @built F-30 manual entry — fuel and two numbers, the path that always works
 * @built F-31 address intake — geocode + assessor prefill, with per-field source
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

const FUELS: { value: BillFuel; label: string; unit: string; hint: string }[] = [
  { value: 'oil', label: 'Heating oil', unit: 'gallons a year', hint: 'Your delivery account shows a yearly total.' },
  { value: 'propane', label: 'Propane', unit: 'gallons a year', hint: 'Summer fill plus winter deliveries.' },
  { value: 'gas', label: 'Natural gas', unit: 'therms a year', hint: 'The annual summary on your gas bill.' },
  { value: 'resistance', label: 'Electric baseboard', unit: 'kWh a year', hint: 'Twelve months of bills, or your account total.' },
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

  const [address, setAddress] = useState('')
  const [lookup, setLookup] = useState<AddressState>({ status: 'idle', message: null, matchedAddress: null })

  const [town, setTown] = useState('')
  const [fuel, setFuel] = useState<BillFuel>('oil')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState(marketPrice.oil ? String(marketPrice.oil) : '')
  const [priceEdited, setPriceEdited] = useState(false)
  const [yearBuilt, setYearBuilt] = useState('')
  const [sqft, setSqft] = useState('')
  const [envelopeSource, setEnvelopeSource] = useState<Source>(null)
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

  async function findAddress() {
    const query = address.trim()
    if (query.length < 6) {
      setLookup({ status: 'error', message: 'Add a street and a town — a ZIP is enough to start.', matchedAddress: null })
      return
    }

    setLookup({ status: 'loading', message: null, matchedAddress: null })
    try {
      const geoResponse = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      const geo = (await geoResponse.json()) as {
        ok: boolean
        message?: string
        matchedAddress?: string
        lat?: number
        lon?: number
        town?: string
        townKnown?: boolean
      }

      if (!geo.ok || geo.lat === undefined || geo.lon === undefined) {
        setLookup({
          status: 'error',
          message: geo.message ?? 'That address did not match. Pick your town below instead.',
          matchedAddress: null,
        })
        return
      }

      if (geo.town && geo.townKnown) setTown(geo.town)
      setLookup({
        status: 'found',
        message: geo.townKnown ? null : 'Matched, but the town is not a Massachusetts municipality. Pick it below.',
        matchedAddress: geo.matchedAddress ?? null,
      })

      // Year built is a convenience, never a requirement: 4s abort, continue without it.
      const parcelResponse = await fetch(`/api/parcel?lat=${geo.lat}&lon=${geo.lon}`)
      const parcel = (await parcelResponse.json()) as {
        ok: boolean
        parcel?: { yearBuilt: number | null; bldAreaSqft: number | null }
      }
      if (parcel.ok && parcel.parcel) {
        if (parcel.parcel.yearBuilt) {
          setYearBuilt(String(parcel.parcel.yearBuilt))
          setEnvelopeSource('assessor')
        }
        if (parcel.parcel.bldAreaSqft) setSqft(String(parcel.parcel.bldAreaSqft))
      }
    } catch {
      setLookup({
        status: 'error',
        message: 'The address lookup is unreachable. Pick your town below — the verdict does not need the coordinate.',
        matchedAddress: null,
      })
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    const params = new URLSearchParams({
      fuel,
      units: units.trim(),
      price: price.trim(),
      town,
      tier,
      year: installYear,
    })
    if (yearBuilt.trim()) params.set('yb', yearBuilt.trim())
    if (sqft.trim()) params.set('sqft', sqft.trim())
    if (envelopeSource) params.set('src', envelopeSource)
    router.push(`/verdict?${params.toString()}`)
  }

  return (
    <form onSubmit={submit} className="grid gap-8">
      {/* ---------------------------------------------------------- address */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-medium">1 · Where is the house?</h2>
          <span className="text-micro text-ink-muted">Optional — but it sets the climate and the utility.</span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="address">
            Street address, town and ZIP
          </label>
          <input
            id="address"
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void findAddress()
              }
            }}
            placeholder="e.g. 888 Washington St, Wellesley, 02482"
            autoComplete="street-address"
            className="w-full rounded-card border border-rule-strong bg-surface px-3 py-2.5 text-body placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={() => void findAddress()}
            disabled={lookup.status === 'loading'}
            className="shrink-0 rounded-card border border-ink bg-ink px-4 py-2.5 text-small font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {lookup.status === 'loading' ? 'Looking up…' : 'Find my house'}
          </button>
        </div>

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
              {envelopeSource ? <FreshnessBadge kind={envelopeSource} label={envelopeSource === 'assessor' ? 'Assessor' : 'You'} /> : null}
            </span>
            <input
              value={yearBuilt}
              onChange={(event) => {
                setYearBuilt(event.target.value)
                setEnvelopeSource(event.target.value.trim() ? 'manual' : null)
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
            <span className="font-medium">How much, per year ({fuelMeta.unit})</span>
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
              onBlur={() => setPriceEdited(price.trim() !== '')}
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

      <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-6">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-card bg-ink px-5 py-3 text-small font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Get the verdict
        </button>
        <p className="text-micro text-ink-muted">
          {town === ''
            ? 'Choose a town — the climate zone and the utility sponsor come from it.'
            : !townsKnown
              ? 'That town is not in the Massachusetts table. Pick it from the list.'
              : canSubmit
                ? 'Nothing is stored. The numbers travel in the link.'
                : 'Two numbers and you are done.'}
        </p>
      </div>
    </form>
  )
}
