'use client'

import { useSyncExternalStore, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AddressCombobox } from '@/components/address-combobox'
import { BillUpload } from '@/components/bill-upload'
import { FreshnessBadge } from '@/components/freshness-badge'
import { DEMO_BILL_SAMPLES } from './sample-bills'
import { matchTown } from '@/lib/address/nominatim'
import { countyOfTown } from '@/lib/geo'
import {
  defaultInstallYear,
  plausibleElectricRate,
  tierFor,
  toQuery,
  type Income,
  type IntakeValues,
  type Scope,
} from '@/lib/intake/params'
import {
  STEPS,
  canLeaveDetails,
  isProfileComplete,
  previousStep,
  profileSnapshot,
  readStoredProfile,
  serializeProfile,
  serverProfileSnapshot,
  stepIndex,
  subscribeProfile,
  validateProfile,
  writeProfile,
  type Profile,
  type Step,
} from '@/lib/onboarding/flow'
import type { BillApplied, BillRole, BillUtility } from '@/lib/parse/contract'
import type { AnnualMethod, BillFuel } from '@/lib/parse/types'

/**
 * @built F-137 the four-step wizard — profile, bill, house, review
 * @built F-138 synthetic sample bills load into the same reader as a photo
 *
 * Addendum B's flow (`docs/superpowers/specs/2026-10-24-onboarding-and-switch-design.md`
 * §3) with one honest substitution: there is no database in this build, so the
 * "account" is a profile kept in this browser, and the screen says exactly that.
 * Everything else is the real thing — the real reader, the real annualisation,
 * the real verdict screen, the real URL as the only state.
 *
 * The bill step reuses `BillUpload` unchanged (F-29/F-65/F-107–F-109), including
 * its low-confidence gate: a field the reader is unsure of must be touched before
 * it can be applied, and the wizard inherits that instead of re-implementing it.
 */

const FUELS: readonly { value: BillFuel; label: string; unit: string }[] = [
  { value: 'oil', label: 'Heating oil', unit: 'Gallons a year' },
  { value: 'propane', label: 'Propane', unit: 'Gallons a year' },
  { value: 'gas', label: 'Natural gas', unit: 'Therms a year' },
  { value: 'resistance', label: 'Electric baseboard', unit: 'kWh a year' },
]

const UNIT_SHORT: Record<BillFuel, string> = { oil: 'gal', propane: 'gal', gas: 'therms', resistance: 'kWh' }

const FUEL_LABEL: Record<BillFuel, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

const UTILITY_LABEL: Record<BillUtility, string> = {
  eversource: 'Eversource',
  national_grid: 'National Grid',
  unitil: 'Unitil',
  liberty: 'Liberty',
  berkshire_gas: 'Berkshire Gas',
  municipal: 'municipal light plant',
  oil_dealer: 'oil dealer',
  propane_dealer: 'propane dealer',
  other: 'another supplier',
}

const EMPTY_PROFILE: Profile = { name: '', email: '', phone: '', consent: false }

export interface OnboardingWizardProps {
  towns: readonly string[]
  prices: {
    mode: 'live' | 'partial' | 'snapshot'
    asOf: string
    oil: number
    propane: number
    elec: number
  }
}

export function OnboardingWizard({ towns, prices }: OnboardingWizardProps) {
  const router = useRouter()

  // ------------------------------------------------------------- the account
  // The stored profile is an external store, so the screen does not re-render the
  // whole wizard just to learn it already knows this household.
  const storedRaw = useSyncExternalStore(subscribeProfile, profileSnapshot, serverProfileSnapshot)
  const stored = readStoredProfile(storedRaw)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [showAccountErrors, setShowAccountErrors] = useState(false)
  const profile: Profile = draft ?? (stored
    ? { name: stored.name, email: stored.email, phone: stored.phone, consent: true }
    : EMPTY_PROFILE)
  const accountErrors = validateProfile(profile)

  // ----------------------------------------------------------------- the bill
  const [heatingBill, setHeatingBill] = useState<BillApplied | null>(null)
  const [electricBill, setElectricBill] = useState<BillApplied | null>(null)
  const [enteringManually, setEnteringManually] = useState(false)

  // ---------------------------------------------------------------- the house
  const [town, setTown] = useState('')
  const [fuel, setFuel] = useState<BillFuel>('oil')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)
  const [yearBuilt, setYearBuilt] = useState('')
  const [sqft, setSqft] = useState('')
  const [scope, setScope] = useState<Scope>('whole')
  const [income, setIncome] = useState<Income>('unsure')
  const [installYear, setInstallYear] = useState<'2026' | '2027'>(defaultInstallYear())
  const [method, setMethod] = useState<AnnualMethod | null>(null)
  const [methodConfidence, setMethodConfidence] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [utility, setUtility] = useState<BillUtility | null>(null)
  const [lowIncome, setLowIncome] = useState<boolean | null>(null)
  const [electricRate, setElectricRate] = useState('')
  const [addressNote, setAddressNote] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('account')

  const marketPrice: Partial<Record<BillFuel, number>> = {
    oil: prices.oil,
    propane: prices.propane,
    resistance: prices.elec,
  }

  const townKnown = towns.includes(town)
  const detailsReady = canLeaveDetails({ fuel, units, price, town, towns })
  const unitLabel = FUELS.find((entry) => entry.value === fuel)?.unit ?? 'units a year'

  function goTo(next: Step) {
    setStep(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** The address is a shortcut to the town, and nothing else. */
  async function lookupTypedAddress(query: string) {
    setAddressNote('Looking that address up…')
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      const payload = (await response.json()) as {
        ok: boolean
        message?: string
        matchedAddress?: string
        town?: string
        townKnown?: boolean
      }
      const matched = matchTown(payload.town, towns)
      if (payload.ok && matched) {
        setTown(matched)
        setAddressNote(payload.matchedAddress ?? `Matched ${matched}.`)
      } else {
        setAddressNote(payload.message ?? 'That address did not match. Pick your town below instead.')
      }
    } catch {
      setAddressNote('The address lookup is unreachable. Pick your town below — the verdict does not need the coordinate.')
    }
  }

  function finishAccount() {
    setShowAccountErrors(true)
    if (!isProfileComplete(profile)) return
    writeProfile(serializeProfile(profile, new Date()))
    setDraft(null)
    goTo('bill')
  }

  function forgetProfile() {
    writeProfile(null)
    setDraft(null)
    setShowAccountErrors(false)
    goTo('account')
  }

  function applyBill(applied: BillApplied) {
    if (applied.role === 'electricity') {
      setElectricBill(applied)
      if (plausibleElectricRate(applied.electricRate) !== null && applied.electricRate) {
        setElectricRate(applied.electricRate)
      }
      return
    }

    setHeatingBill(applied)
    setEnteringManually(false)
    if (applied.fuel) setFuel(applied.fuel)
    setUnits(applied.units)
    setPrice(applied.price)
    setPriceTouched(true)
    setMethod(applied.method)
    setMethodConfidence(applied.methodConfidence)
    setNote(applied.note)
    if (applied.utility) setUtility(applied.utility)
    setLowIncome(applied.lowIncomeSignal)
    if (applied.serviceTown) {
      const matched = towns.find((name) => name.toLowerCase() === applied.serviceTown?.trim().toLowerCase())
      if (matched) setTown(matched)
    }
    if (plausibleElectricRate(applied.electricRate) !== null && applied.electricRate) {
      setElectricRate(applied.electricRate)
    }
  }

  function undoBill(role: BillRole) {
    if (role === 'heating') {
      setHeatingBill(null)
      setMethod(null)
      setMethodConfidence(null)
      setNote('')
    } else {
      setElectricBill(null)
      setElectricRate('')
    }
  }

  function enterDetails() {
    if (heatingBill === null && price.trim() === '' && !priceTouched) {
      const market = marketPrice[fuel]
      if (market) setPrice(String(market))
    }
    goTo('details')
  }

  function chooseFuel(next: BillFuel) {
    setFuel(next)
    if (heatingBill === null && !priceTouched) {
      const market = marketPrice[next]
      setPrice(market ? String(market) : '')
    }
  }

  function submitVerdict() {
    if (!detailsReady) return
    const values: IntakeValues = {
      fuel,
      units,
      price,
      town,
      tier: tierFor(scope, income, fuel),
      income,
      year: installYear,
      yearBuilt,
      sqft,
      src: yearBuilt.trim() ? 'manual' : null,
      buildingUnits: null,
      installCost: '',
      method,
      methodConfidence,
      note,
      utility,
      electricRate: plausibleElectricRate(electricRate) !== null ? electricRate : '',
      lowIncome,
      weatherizationBonus: false,
      sizingBonus: false,
    }
    router.push(`/verdict?${toQuery(values).toString()}`)
  }

  return (
    <div className="grid gap-8">
      <Stepper step={step} onJump={(target) => goTo(target)} />

      {step === 'account' ? (
        <section className="rounded-card border border-rule bg-surface p-5 sm:p-6">
          <p className="text-eyebrow uppercase text-ink-muted">{STEPS[0].eyebrow}</p>
          <h2 className="mt-2 text-title font-medium">Create your profile</h2>
          <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
            A name to greet you, an email to keep on the profile, and a phone number only if you want texts. No
            password — there is nothing to log in to yet.
          </p>

          <p className="mt-3 rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-3 text-micro text-ink-muted">
            <span className="font-medium text-ink">This build keeps your profile in this browser.</span> No account is
            created on a server, nothing is emailed, and your bill photo is never stored — it is read in memory and
            discarded. Forget it with one button at the end.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="What should we call you?" error={showAccountErrors ? accountErrors.name : undefined}>
              <input
                value={profile.name}
                onChange={(event) => setDraft({ ...profile, name: event.target.value })}
                autoComplete="name"
                placeholder="Alex Rivera"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
              />
            </Field>

            <Field label="Email" error={showAccountErrors ? accountErrors.email : undefined}>
              <input
                value={profile.email}
                onChange={(event) => setDraft({ ...profile, email: event.target.value })}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
              />
            </Field>

            <Field
              label="Phone (optional, for texts)"
              error={showAccountErrors ? accountErrors.phone : undefined}
              hint="Leave it empty if you only want email."
            >
              <input
                value={profile.phone}
                onChange={(event) => setDraft({ ...profile, phone: event.target.value })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(617) 555-0142"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
              />
            </Field>
          </div>

          <label className="mt-4 flex max-w-[62ch] cursor-pointer items-start gap-2.5 text-small text-ink-muted">
            <input
              type="checkbox"
              checked={profile.consent}
              onChange={(event) => setDraft({ ...profile, consent: event.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              I have read the privacy summary: the profile stays in this browser, bill images are never stored, and no
              number is sold or sent to a provider.
            </span>
          </label>
          {showAccountErrors && accountErrors.consent ? (
            <p className="mt-1 text-micro text-deadline">{accountErrors.consent}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={finishAccount}
              className="rounded-pill bg-ink px-6 py-3 text-small font-medium text-paper transition-opacity hover:opacity-90"
            >
              Continue to your bill
            </button>
            {stored ? (
              <button type="button" onClick={forgetProfile} className="text-micro text-ink-muted underline">
                Forget this profile
              </button>
            ) : null}
            <p className="text-micro text-ink-faint">Takes about two minutes, most of it photographing the bill.</p>
          </div>
        </section>
      ) : null}

      {step === 'bill' ? (
        <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">{STEPS[1].eyebrow}</p>
            <h2 className="mt-2 text-title font-medium">Show us one bill</h2>
            <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
              Oil delivery ticket, gas or electric bill — one page is enough. Three is the limit. We read it, show you
              what we found, and you confirm it before it touches the verdict.
            </p>
          </div>

          <BillUpload
            onApply={applyBill}
            onUndo={undoBill}
            countyFips={townKnown ? countyOfTown(town)?.fips : undefined}
            samples={DEMO_BILL_SAMPLES}
          />

          {heatingBill ? (
            <div className="rounded-card border border-rule bg-paper-sunk/60 p-3">
              <p className="flex flex-wrap items-center gap-2 text-small">
                <FreshnessBadge kind="bill" label="Heating bill" />
                <span className="text-ink">
                  {FUEL_LABEL[heatingBill.fuel ?? 'oil']} · {heatingBill.units}
                </span>
              </p>
              <p className="mt-1 text-micro text-ink-muted">{heatingBill.note}</p>
            </div>
          ) : null}

          {electricBill ? (
            <p className="text-micro text-ink-muted">
              Electric bill added: ${electricBill.price}/kWh
              {electricBill.utility ? ` from ${UTILITY_LABEL[electricBill.utility]}` : ''}. The verdict will use your
              own rate instead of the statewide average.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={enterDetails}
              disabled={!heatingBill && !enteringManually}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper disabled:opacity-40"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setEnteringManually(true)
                enterDetails()
              }}
              className="text-micro text-ink-muted underline"
            >
              No bill handy? Enter the numbers myself
            </button>
          </div>
        </section>
      ) : null}

      {step === 'details' ? (
        <section className="grid gap-5 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">{STEPS[2].eyebrow}</p>
            <h2 className="mt-2 text-title font-medium">Where is the house?</h2>
            <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
              The town sets the climate and the utility sponsor. The street address is a shortcut, not a requirement —
              it never leaves this browser except to the Census geocoder.
            </p>
          </div>

          <AddressCombobox
            onSelect={(suggestion) => {
              const matched = matchTown(suggestion.town, towns)
              if (matched) {
                setTown(matched)
                setAddressNote(suggestion.label)
              } else {
                setAddressNote('That address is outside the 351 towns. Pick your town below.')
              }
            }}
            onTyped={(value) => void lookupTypedAddress(value)}
          />
          {addressNote ? <p className="text-micro text-ink-muted">{addressNote}</p> : null}

          <label className="grid max-w-sm gap-1.5 text-small">
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
            <span className="text-micro text-ink-faint">Required. It sets the heating degree days.</span>
          </label>

          <div className="grid gap-3">
            <h3 className="text-small font-medium">What do you burn, and how much in a year?</h3>
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
              <Field label={unitLabel}>
                <input
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 800"
                  className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
                />
                {heatingBill ? <span className="text-micro text-ink-faint">From your bill. Edit it if it is wrong.</span> : null}
              </Field>
              <Field label={`Price per ${fuel === 'gas' ? 'therm' : fuel === 'resistance' ? 'kWh' : 'gallon'}`}>
                <input
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value)
                    setPriceTouched(true)
                  }}
                  inputMode="decimal"
                  placeholder={marketPrice[fuel] ? String(marketPrice[fuel]) : 'e.g. 4.50'}
                  className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
                />
                <span className="text-micro text-ink-faint">
                  {heatingBill ? 'Your all-in price from the bill.' : "Today's statewide price is prefilled; overwrite it with what you actually pay."}
                </span>
              </Field>
            </div>
            {note ? <p className="text-micro text-ink-muted">How the year was worked out: {note}</p> : null}
            {electricRate ? (
              <p className="text-micro text-ink-muted">
                Electricity: ${electricRate}/kWh from your electric bill — used for the heat-pump running cost.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Year built (optional)">
              <input
                value={yearBuilt}
                onChange={(event) => setYearBuilt(event.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1952"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
              />
            </Field>
            <Field label="Heated area in sqft (optional)">
              <input
                value={sqft}
                onChange={(event) => setSqft(event.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1,600"
                className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
              />
            </Field>
          </div>
          <p className="text-micro text-ink-faint">
            Year built and area are only used when a bill is missing. They never change a price.
          </p>

          <fieldset className="grid gap-2">
            <legend className="text-small font-medium">Is the household under the Mass Save income limit?</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['yes', 'Yes'],
                  ['no', 'No'],
                  ['unsure', 'Not sure'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={income === value}
                  onClick={() => setIncome(value)}
                  className={`rounded-pill border px-3.5 py-2 text-small transition-colors ${
                    income === value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-micro text-ink-faint">
              Not sure counts as the standard rebate — we never promise a discount on a guess.
              {lowIncome ? ' Your bill shows a discount rate, so it is worth checking.' : ''}
            </p>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-small font-medium">Whole system, or adding to existing equipment?</legend>
            <div className="flex max-w-xs gap-2">
              {(
                [
                  ['whole', 'Whole system'],
                  ['partial', 'Adding to it'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={`flex-1 rounded-pill border px-3.5 py-2 text-small transition-colors ${
                    scope === value
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <details open={installYear === '2027'} className="text-small">
            <summary className="cursor-pointer text-ink-muted">Installing in 2027 instead?</summary>
            <div className="mt-2 flex max-w-xs gap-2">
              {(['2026', '2027'] as const).map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={installYear === year}
                  onClick={() => setInstallYear(year)}
                  className={`flex-1 rounded-pill border px-3.5 py-2 tabular-nums transition-colors ${
                    installYear === year
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
            <p className="mt-2 text-micro text-ink-faint">
              The whole-home rebate drops from $2,650 to $2,350 per ton on 1 January 2027.
            </p>
          </details>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => goTo(previousStep('details'))}
              className="rounded-pill border border-rule-strong px-4 py-2.5 text-small text-ink-muted hover:border-ink hover:text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => goTo('review')}
              disabled={!detailsReady}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper disabled:opacity-40"
            >
              Review
            </button>
            {!detailsReady ? (
              <p className="text-micro text-ink-faint">A town and two positive numbers and we can answer.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'review' ? (
        <section className="grid gap-5 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">{STEPS[3].eyebrow}</p>
            <h2 className="mt-2 text-title font-medium">Check it once, then we answer.</h2>
            <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
              Every line below says where it came from. Nothing is guessed, and the verdict screen keeps the same
              provenance when you go back to change a number.
            </p>
          </div>

          <dl className="divide-y divide-rule border-y border-rule">
            <SummaryRow term="Profile" badge={<FreshnessBadge kind="manual" />}>
              {profile.name.trim()} · {profile.email.trim()}
              {profile.phone.trim() ? ` · ${profile.phone.trim()}` : ''}
            </SummaryRow>

            <SummaryRow
              term="Heating fuel and a year"
              badge={<FreshnessBadge kind={heatingBill ? 'bill' : 'manual'} />}
            >
              {FUEL_LABEL[fuel]} · {units} {UNIT_SHORT[fuel]} at ${price} each
            </SummaryRow>

            <SummaryRow term="Town" badge={<FreshnessBadge kind="manual" />}>
              {town}
              {utility ? ` · ${UTILITY_LABEL[utility]}` : ''}
            </SummaryRow>

            {electricRate ? (
              <SummaryRow term="Electricity price" badge={<FreshnessBadge kind="bill" />}>
                ${electricRate}/kWh
              </SummaryRow>
            ) : null}

            {yearBuilt.trim() || sqft.trim() ? (
              <SummaryRow term="House" badge={<FreshnessBadge kind="manual" />}>
                {[yearBuilt.trim() ? `built ${yearBuilt.trim()}` : null, sqft.trim() ? `${sqft.trim()} sqft` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </SummaryRow>
            ) : null}

            <SummaryRow term="Programs" badge={<FreshnessBadge kind="manual" />}>
              {scope === 'whole' ? 'Whole system' : 'Adding to existing equipment'} · income limit:{' '}
              {income === 'yes' ? 'yes' : income === 'no' ? 'no' : 'not sure'} · installing {installYear}
            </SummaryRow>
          </dl>

          {heatingBill?.note ? <p className="text-micro text-ink-muted">{heatingBill.note}</p> : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => goTo(previousStep('review'))}
              className="rounded-pill border border-rule-strong px-4 py-2.5 text-small text-ink-muted hover:border-ink hover:text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={submitVerdict}
              disabled={!detailsReady}
              className="group inline-flex items-center gap-3 rounded-pill bg-ink px-6 py-3.5 text-small font-medium text-paper transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
            >
              See the verdict
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </button>
            <LinkLike onClick={() => goTo('bill')}>Change the bill</LinkLike>
            <LinkLike onClick={() => goTo('details')}>Change the numbers</LinkLike>
            {stored ? <LinkLike onClick={forgetProfile}>Forget my profile</LinkLike> : null}
          </div>
          <p className="text-micro text-ink-faint">
            Your profile is only in this browser. The verdict link is the only thing that leaves it, and it carries no
            name, email or phone number.
          </p>
        </section>
      ) : null}
    </div>
  )
}

function Stepper({ step, onJump }: { step: Step; onJump: (step: Step) => void }) {
  const current = stepIndex(step)
  return (
    <nav aria-label="Your progress">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 text-micro sm:flex sm:flex-wrap sm:gap-x-6 sm:text-small">
        {STEPS.map((entry, index) => {
          const done = index < current
          const active = entry.id === step
          return (
            <li key={entry.id} aria-current={active ? 'step' : undefined} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`grid h-6 w-6 place-items-center rounded-full border text-micro tabular-nums ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : done
                      ? 'border-switch-edge bg-switch-tint text-switch'
                      : 'border-rule-strong text-ink-faint'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              {done ? (
                <button type="button" onClick={() => onJump(entry.id)} className="text-ink-muted underline">
                  {entry.label}
                </button>
              ) : (
                <span className={active ? 'font-medium text-ink' : 'text-ink-faint'}>{entry.label}</span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {current + 1} of {STEPS.length}: {STEPS[current].label}
      </p>
    </nav>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-small">
      <span className="font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-micro text-deadline">{error}</span>
      ) : hint ? (
        <span className="text-micro text-ink-faint">{hint}</span>
      ) : null}
    </label>
  )
}

function SummaryRow({
  term,
  badge,
  children,
}: {
  term: string
  badge: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,13rem)_1fr] sm:items-baseline sm:gap-6">
      <dt className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
        {term}
        {badge}
      </dt>
      <dd className="text-small text-ink">{children}</dd>
    </div>
  )
}

function LinkLike({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-micro text-ink-muted underline">
      {children}
    </button>
  )
}
