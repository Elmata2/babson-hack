'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AddressCombobox } from './address-combobox'
import { BillUpload } from './bill-upload'
import { FreshnessBadge } from './freshness-badge'
import { matchTown, type AddressSuggestion } from '@/lib/address/nominatim'
import { countyOfTown } from '@/lib/geo'
import { houseNumberOf, judgeParcel } from '@/lib/parcel/guard'
import {
  defaultInstallYear,
  plausibleElectricRate,
  questionsFor,
  tierFor,
  toQuery,
  type Income,
  type IntakeValues,
  type Scope,
} from '@/lib/intake/params'
import type { BillApplied, BillRole, BillUtility } from '@/lib/parse/contract'
import type { AnnualMethod, BillFuel } from '@/lib/parse/types'

/**
 * @built F-30 manual entry — fuel and two numbers, the path that always works
 * @built F-31 address intake — geocode + assessor prefill, with per-field source
 * @built F-64 the address field is a type-ahead over OpenStreetMap, so "106 Chandler"
 * asks which one, instead of silently choosing
 * @built F-65 bill upload sits beside the numbers and fills them only on request
 * @built F-104 parcel guard — house number and use code checked on every match, units split
 * @built F-105 bill-first layout: the photo card leads, the town list hides unless needed,
 * plain questions replace the rebate-tier dropdown
 * @built F-106 the form hydrates from the verdict's query, so "Change the numbers" loses nothing
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

export interface IntakeFormProps {
  towns: readonly string[]
  prices: {
    mode: 'live' | 'partial' | 'snapshot'
    asOf: string
    oil: number
    propane: number
    elec: number
  }
  /** Values read from the verdict's query string, so the round trip loses nothing. */
  initial?: Partial<IntakeValues>
}

type Source = 'assessor' | 'manual' | null

const UTILITY_NAME: Record<BillUtility, string> = {
  eversource: 'Eversource',
  national_grid: 'National Grid',
  unitil: 'Unitil',
  liberty: 'Liberty',
  berkshire_gas: 'Berkshire Gas',
  municipal: 'your town light plant',
  oil_dealer: 'your oil dealer',
  propane_dealer: 'your propane dealer',
  other: 'your utility',
}

interface AddressState {
  status: 'idle' | 'loading' | 'found' | 'error'
  message: string | null
  matchedAddress: string | null
}

export function IntakeForm({ towns, prices, initial = {} }: IntakeFormProps) {
  const router = useRouter()
  const marketPrice: Partial<Record<BillFuel, number>> = {
    oil: prices.oil,
    propane: prices.propane,
    resistance: prices.elec,
  }

  const initialQuestions = questionsFor(initial.tier ?? null, initial.income ?? null)
  const initialFuel = initial.fuel ?? 'oil'

  const [lookup, setLookup] = useState<AddressState>({ status: 'idle', message: null, matchedAddress: null })
  const [town, setTown] = useState(initial.town ?? '')
  const [fuel, setFuel] = useState<BillFuel>(initialFuel)
  const [units, setUnits] = useState(initial.units ?? '')
  const [price, setPrice] = useState(initial.price ?? (marketPrice[initialFuel] ? String(marketPrice[initialFuel]) : ''))
  const [priceEdited, setPriceEdited] = useState(Boolean(initial.price))
  const [yearBuilt, setYearBuilt] = useState(initial.yearBuilt ?? '')
  const [sqft, setSqft] = useState(initial.sqft ?? '')
  const [envelopeSource, setEnvelopeSource] = useState<Source>(initial.src ?? null)
  const [envelopeMatch, setEnvelopeMatch] = useState<'exact' | 'buffered' | null>(null)
  const [buildingUnits, setBuildingUnits] = useState<number | null>(initial.buildingUnits ?? null)
  const [parcelNote, setParcelNote] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>(initialQuestions.scope)
  const [income, setIncome] = useState<Income>(initialQuestions.income)
  const [incomeNote, setIncomeNote] = useState<string | null>(null)
  const [installYear, setInstallYear] = useState<'2026' | '2027'>(initial.year ?? defaultInstallYear())
  // What the bill told us, carried to the verdict so it can say how the year was worked out.
  const [method, setMethod] = useState<AnnualMethod | null>(initial.method ?? null)
  const [methodConfidence, setMethodConfidence] = useState<number | null>(initial.methodConfidence ?? null)
  const [note, setNote] = useState(initial.note ?? '')
  const [utility, setUtility] = useState<BillUtility | null>(initial.utility ?? null)
  const [lowIncome, setLowIncome] = useState<boolean | null>(initial.lowIncome ?? null)
  const [electricRate, setElectricRate] = useState(initial.electricRate ?? '')
  // Blank means the Mass Save average; the verdict labels which one it used.
  const [installCost, setInstallCost] = useState(initial.installCost ?? '')
  const [electricNote, setElectricNote] = useState<string | null>(
    initial.electricRate ? `Your electricity: $${initial.electricRate}/kWh from your bill` : null,
  )
  const billBefore = useRef<Partial<Record<BillRole, {
    town: string
    fuel: BillFuel
    units: string
    price: string
    priceEdited: boolean
    method: AnnualMethod | null
    methodConfidence: number | null
    note: string
    utility: BillUtility | null
    lowIncome: boolean | null
    income: Income
    incomeNote: string | null
    electricRate: string
    electricNote: string | null
  }>>>({})

  const tier = tierFor(scope, income, fuel)
  const fuelMeta = FUELS.find((entry) => entry.value === fuel) ?? FUELS[0]
  const townsKnown = towns.includes(town)
  // The 351-option list is the fallback, not the front door: show it only when
  // no address resolved a town for us.
  const showTown = lookup.status !== 'found' || town === ''
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
    setParcelNote(null)
    setBuildingUnits(null)
    const ask = async (buffer: number) => {
      const query = `lat=${lat}&lon=${lon}${buffer > 0 ? `&buffer=${buffer}` : ''}`
      const response = await fetch(`/api/parcel?${query}`)
      return (await response.json()) as {
        ok: boolean
        match?: 'exact' | 'buffered'
        parcel?: {
          yearBuilt: number | null
          bldAreaSqft: number | null
          siteAddr?: string
          useCode?: string | null
          units?: number | null
        }
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

      // The guard runs on every match, exact or buffered: an exact point can
      // still land on the neighbour, or on a church.
      const verdict = judgeParcel({
        expectedHouse: expectedHouse ?? null,
        parcel: {
          yearBuilt: payload.parcel.yearBuilt,
          bldAreaSqft: payload.parcel.bldAreaSqft,
          siteAddr: payload.parcel.siteAddr,
          useCode: payload.parcel.useCode,
          units: payload.parcel.units,
        },
      })
      if (!verdict.use) {
        setParcelNote(verdict.reason === 'not_a_home' ? verdict.message : null)
        return
      }

      setParcelNote(verdict.unitsNote)
      setBuildingUnits(verdict.units > 1 ? verdict.units : null)
      if (verdict.yearBuilt) {
        setYearBuilt(String(verdict.yearBuilt))
        setEnvelopeSource('assessor')
        setEnvelopeMatch(buffered ? 'buffered' : 'exact')
      }
      if (verdict.sqft) setSqft(String(verdict.sqft))
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

  /** One bill, applied. An electric bill that is not the heat source never touches the heating fuel. */
  function applyBill(bill: BillApplied) {
    if (!billBefore.current[bill.role]) {
      billBefore.current[bill.role] = {
        town, fuel, units, price, priceEdited, method, methodConfidence, note,
        utility, lowIncome, income, incomeNote, electricRate, electricNote,
      }
    }
    if (bill.utility) setUtility(bill.utility)
    setLowIncome(bill.lowIncomeSignal)
    if (bill.lowIncomeSignal) {
      setIncomeNote(
        'Your bill shows a discount rate — you may qualify for enhanced rebates. Select Yes only if your household is under the Mass Save income limit.',
      )
    } else setIncomeNote(null)
    if (bill.serviceTown && town === '') {
      const match = towns.find((name) => name.toLowerCase() === bill.serviceTown?.trim().toLowerCase())
      if (match) setTown(match)
    }

    const rate = plausibleElectricRate(bill.electricRate)
    if (rate !== null && bill.electricRate) {
      setElectricRate(bill.electricRate)
      const who = bill.utility ? ` from your ${UTILITY_NAME[bill.utility]} bill` : ' from your bill'
      setElectricNote(`Your electricity: $${bill.electricRate}/kWh${who}`)
    }

    if (bill.role === 'electricity' || !bill.fuel) return

    setFuel(bill.fuel)
    setUnits(bill.units)
    setPrice(bill.price)
    setPriceEdited(true)
    setMethod(bill.method)
    setMethodConfidence(bill.methodConfidence)
    setNote(bill.note)
  }

  function undoBill(role: BillRole) {
    const before = billBefore.current[role]
    if (!before) return
    delete billBefore.current[role]
    if (role === 'heating') {
      setFuel(before.fuel)
      setUnits(before.units)
      setPrice(before.price)
      setPriceEdited(before.priceEdited)
      setMethod(before.method)
      setMethodConfidence(before.methodConfidence)
      setNote(before.note)
    }
    setElectricRate(before.electricRate)
    setElectricNote(before.electricNote)
    if (!billBefore.current.heating && !billBefore.current.electricity) {
      setTown(before.town)
      setUtility(before.utility)
      setLowIncome(before.lowIncome)
      setIncome(before.income)
      setIncomeNote(before.incomeNote)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    const values: IntakeValues = {
      // The address is carried, not used: it keeps the round trip lossless (R10.6).
      address: initial.address,
      fuel, units, price, town, tier, income, year: installYear, yearBuilt, sqft,
      src: envelopeSource, buildingUnits, method, methodConfidence, note, utility, electricRate, lowIncome,
      // The bonuses are asserted on the verdict screen, not here; carry them so a
      // round trip through "Change the numbers" does not quietly drop them.
      weatherizationBonus: initial.weatherizationBonus === true,
      sizingBonus: initial.sizingBonus === true,
      installCost,
    }
    router.push(`/verdict?${toQuery(values).toString()}`)
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
      {/* ------------------------------------------------------------- bill */}
      <section className="grid gap-3 rounded-card border border-rule-strong bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-medium">Snap your heating bill</h2>
          <FreshnessBadge kind={prices.mode === 'live' ? 'live' : 'snapshot'} date={prices.asOf} label="Prices" />
        </div>
        <p className="text-small text-ink-muted">
          A photo of a gas or electric bill, or an oil delivery ticket. We read it; you check it.
        </p>
        <button
          type="button"
          onClick={() => chooseFuel('resistance')}
          className="justify-self-start text-small text-ink-muted underline"
        >
          {fuel === 'resistance' ? 'Electric baseboard heat selected' : 'Heat with electric baseboard? Select it before uploading.'}
        </button>

        <BillUpload
          onApply={applyBill}
          onUndo={undoBill}
          countyFips={countyOfTown(town)?.fips}
          heating={fuel === 'resistance' ? true : undefined}
        />

        {electricNote ? <p className="text-micro text-ink-muted tabular-nums">{electricNote}</p> : null}
        {note && method ? <p className="text-micro text-ink-muted">{note}</p> : null}
      </section>

      {/* ----------------------------------------------------- by hand */}
      <section className="grid gap-5">
        <h2 className="text-title font-medium">No bill handy? Enter it yourself</h2>

        <div className="grid gap-3">
          <h3 className="text-small font-medium">Where is the house?</h3>
          <AddressCombobox
            onSelect={(suggestion) => void handleSuggestion(suggestion)}
            onTyped={(value) => void handleTypedAddress(value)}
            initialValue={initial.address}
          />

          {lookup.matchedAddress ? (
            <p className="text-micro text-ink-muted">
              Matched: {lookup.matchedAddress}
              {town ? ` · ${town}` : ''}
            </p>
          ) : null}
          {lookup.message ? <p className="text-micro text-deadline">{lookup.message}</p> : null}
          {parcelNote ? <p className="text-micro text-ink-muted">{parcelNote}</p> : null}

          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
            {showTown ? (
              <label className="grid gap-1.5 text-small">
                <span className="font-medium">Which town?</span>
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
                <span className="text-micro text-ink-faint">Required. It sets the climate and the utility.</span>
              </label>
            ) : (
              <div className="grid gap-1.5 text-small">
                <span className="font-medium">Town</span>
                <p className="py-2.5">{town}</p>
              </div>
            )}

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
                onChange={(event) => {
                  setSqft(event.target.value)
                  setBuildingUnits(null)
                }}
                inputMode="numeric"
                placeholder="e.g. 1,600"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
              />
              {buildingUnits ? (
                <span className="text-micro text-ink-faint">
                  Assumption: the building&rsquo;s area divided by its {buildingUnits} units.
                </span>
              ) : null}
            </label>
          </div>
          <p className="text-micro text-ink-faint">
            Year built and floor area are used only for the envelope fallback when a bill is missing. They never
            change a price.
          </p>
        </div>

        <div className="grid gap-3">
          <h3 className="text-small font-medium">What do you burn, and how much?</h3>
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
                onChange={(event) => {
                  setUnits(event.target.value)
                  // A typed number is no longer "from the bill"; drop the provenance.
                  setMethod(null)
                  setMethodConfidence(null)
                  setNote('')
                }}
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
        </div>
      </section>

      {/* ---------------------------------------------------------- upgrade */}
      <section className="grid gap-4">
        <h2 className="text-title font-medium">What are you buying?</h2>

        <fieldset className="grid gap-1.5 text-small">
          <legend className="font-medium">Replacing the whole heating system, or adding to it?</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['whole', 'Replacing the whole system'],
                ['partial', 'Adding to what I have'],
              ] as const
            ).map(([value, label]) => (
              <ChoiceButton key={value} active={scope === value} onClick={() => setScope(value)}>
                {label}
              </ChoiceButton>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-1.5 text-small">
          <legend className="font-medium">Is your household income under the Mass Save limit?</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['yes', 'Yes'],
                ['no', 'No'],
                ['unsure', 'Not sure'],
              ] as const
            ).map(([value, label]) => (
              <ChoiceButton
                key={value}
                active={income === value}
                onClick={() => {
                  setIncome(value)
                  setIncomeNote(null)
                }}
              >
                {label}
              </ChoiceButton>
            ))}
          </div>
          {incomeNote ? <p className="text-micro text-ink-muted">{incomeNote}</p> : null}
          {income === 'yes' && fuel === 'gas' ? (
            <p className="text-micro text-ink-faint">
              Mass Save&rsquo;s enhanced rebate is closed to homes that heat with gas, so we use the standard one.
            </p>
          ) : null}
          {income === 'unsure' ? (
            <p className="text-micro text-ink-faint">Not sure counts as the standard rebate. We never assume a discount.</p>
          ) : null}
        </fieldset>

        <details open={installYear === '2027'} className="text-small">
          <summary className="cursor-pointer text-ink-muted">Installing in 2027 instead?</summary>
          <div className="mt-2 flex max-w-xs gap-2">
            {(['2026', '2027'] as const).map((year) => (
              <ChoiceButton key={year} active={installYear === year} onClick={() => setInstallYear(year)} className="flex-1 tabular-nums">
                {year}
              </ChoiceButton>
            ))}
          </div>
          <p className="mt-2 text-micro text-ink-faint">
            The whole-home rebate drops from $2,650 to $2,350 per ton on 1 January 2027. The verdict will say so
            in dollars, not adjectives.
          </p>
        </details>

        <label className="grid max-w-sm gap-1.5 text-small">
          <span className="font-medium">
            A contractor&rsquo;s quote? <span className="font-normal text-ink-faint">(optional)</span>
          </span>
          <input
            value={installCost}
            onChange={(event) => setInstallCost(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="22,000"
            className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
          />
          <span className="text-micro text-ink-faint">
            Leave it blank and the verdict uses the Mass Save average of $22,000, labelled as the average. A quote
            replaces it and moves the rebate, the payback and the loan.
          </span>
        </label>
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

function ChoiceButton({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-pill border px-3.5 py-2 text-small transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  )
}
