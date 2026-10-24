'use client'

import { useSyncExternalStore, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AddressCombobox } from '@/components/address-combobox'
import { BillUpload } from '@/components/bill-upload'
import { FreshnessBadge } from '@/components/freshness-badge'
import { DEMO_BILL_SAMPLES } from './sample-bills'
import { HOUSEHOLD_SIZE_MAX, MASS_SAVE_PHONE, eligibilityFor, incomeResultCopy, parseIncome } from '@/lib/onboarding/income'
import { mapProfileFrom, mergeMapProfile } from '@/lib/onboarding/profile-map'
import { matchTown } from '@/lib/address/nominatim'
import { demoFromLocation, withDemo } from '@/lib/demo'
import { countyOfTown } from '@/lib/geo'
import {
  defaultInstallYear,
  plausibleElectricRate,
  tierFor,
  toQuery,
  type Income,
  type IntakeValues,
} from '@/lib/intake/params'
import {
  anyDetailsNeeded,
  billsReady,
  canLeaveDetails,
  detailsNeeds,
  eyebrowFor,
  fuelFromBill,
  isProfileComplete,
  lowIncomeDetected,
  hasSingleSponsor,
  lowIncomeFlag,
  misplacedBillNote,
  positiveNumber,
  townMismatch,
  nextStep,
  pickUtility,
  previousStep,
  profileSnapshot,
  readStoredProfile,
  serializeProfile,
  serverProfileSnapshot,
  serviceTownFrom,
  subscribeProfile,
  validateProfile,
  visibleSteps,
  withoutProfile,
  writeProfile,
  type BillSlots,
  type Profile,
  type Step,
} from '@/lib/onboarding/flow'
import type { BillApplied, BillRole, BillUtility } from '@/lib/parse/contract'
import type { BillFuel } from '@/lib/parse/types'

/**
 * @built F-137 the four-step wizard — profile, bill, house, review
 * @built F-138 synthetic sample bills load into the same reader as a photo
 * @built F-49 the wizard's geocode, bill and verdict links all carry `?demo=1`, so
 * a demo profile never reaches a provider; every refusal has a manual path here
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

  // ----------------------------------------------------------------- the bills
  const [heatingBill, setHeatingBill] = useState<BillApplied | null>(null)
  const [electricBill, setElectricBill] = useState<BillApplied | null>(null)
  const [heatingByHand, setHeatingByHand] = useState(false)
  const [electricByHand, setElectricByHand] = useState(false)
  const [slotNote, setSlotNote] = useState<{ slot: BillRole; text: string } | null>(null)

  // ---------------------------------------------------------------- the house
  const [townPick, setTownPick] = useState<string | null>(null)
  const [editingTown, setEditingTown] = useState(false)
  const [manualFuel, setManualFuel] = useState<BillFuel>('oil')
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)
  const [householdSize, setHouseholdSize] = useState<number | null>(null)
  const [incomeText, setIncomeText] = useState('')
  const [incomeDeclined, setIncomeDeclined] = useState(false)
  const [addressNote, setAddressNote] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('account')

  const bills = [electricBill, heatingBill] as const
  const billTown = serviceTownFrom(bills, towns)
  const town = townPick ?? billTown ?? ''
  const fuel: BillFuel = fuelFromBill(heatingBill) ?? manualFuel
  const incomeDetected = lowIncomeDetected(bills)
  const estimatedIncome = incomeDeclined ? null : parseIncome(incomeText)
  const income: Income = incomeDetected
    ? 'yes'
    : fuel === 'gas'
      ? 'unsure'
      : eligibilityFor(householdSize, estimatedIncome)
  const incomeResult = incomeDeclined ? null : incomeResultCopy(householdSize, estimatedIncome)
  const utility = pickUtility(electricBill, heatingBill, hasSingleSponsor(town))
  const mismatch = townMismatch(electricBill, heatingBill, towns)
  const electricRate =
    [electricBill?.electricRate, heatingBill?.electricRate].find(
      (rate): rate is string => typeof rate === 'string' && plausibleElectricRate(rate) !== null,
    ) ?? ''
  const numbersReady = positiveNumber(units) !== null && positiveNumber(price) !== null
  const needs = detailsNeeds({
    townRead: billTown !== null && town !== '' && !editingTown,
    heating: heatingBill,
    incomeDetected,
    numbersReady,
  })
  const slots: BillSlots = { heating: heatingBill, electricity: electricBill, heatingByHand, electricityByHand: electricByHand }

  const marketPrice: Partial<Record<BillFuel, number>> = {
    oil: prices.oil,
    propane: prices.propane,
    resistance: prices.elec,
  }

  const townKnown = towns.includes(town)
  const detailsReady = canLeaveDetails({ fuel, units, price, town, towns })
  const unitLabel = FUELS.find((entry) => entry.value === fuel)?.unit ?? 'units a year'
  const detailsNeeded = anyDetailsNeeded(needs) || !detailsReady

  function goTo(next: Step) {
    setStep(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** The address is a shortcut to the town, and nothing else. */
  async function lookupTypedAddress(query: string) {
    setAddressNote('Looking that address up…')
    try {
      const response = await fetch(withDemo(`/api/geocode?q=${encodeURIComponent(query)}`, demoFromLocation()))
      const payload = (await response.json()) as {
        ok: boolean
        message?: string
        matchedAddress?: string
        town?: string
        townKnown?: boolean
      }
      const matched = matchTown(payload.town, towns)
      if (payload.ok && matched) {
        setTownPick(matched)
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
    writeProfile(serializeProfile(profile, new Date(), profileSnapshot()))
    setDraft(null)
    goTo('bill')
  }

  function forgetProfile() {
    writeProfile(withoutProfile(profileSnapshot()))
    setDraft(null)
    setShowAccountErrors(false)
    goTo('account')
  }

  function applyBill(applied: BillApplied, slot: BillRole) {
    const text = misplacedBillNote(slot, applied.role)
    setSlotNote(text ? { slot, text } : null)
    if (applied.role === 'electricity') {
      setElectricBill(applied)
      setElectricByHand(false)
      return
    }
    setHeatingBill(applied)
    setHeatingByHand(false)
    setUnits(applied.units)
    setPrice(applied.price)
    setPriceTouched(true)
  }

  function undoBill(role: BillRole) {
    setSlotNote(null)
    if (role === 'heating') {
      setHeatingBill(null)
      setUnits('')
      setPrice('')
      setPriceTouched(false)
    } else {
      setElectricBill(null)
    }
  }

  function enterHeatingByHand() {
    setHeatingByHand(true)
    if (price.trim() === '' && !priceTouched) {
      const market = marketPrice[fuel]
      if (market) setPrice(String(market))
    }
  }

  function chooseFuel(next: BillFuel) {
    setManualFuel(next)
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
      tier: tierFor('whole', income, fuel),
      income,
      year: defaultInstallYear(),
      yearBuilt: '',
      sqft: '',
      src: null,
      buildingUnits: null,
      installCost: '',
      method: heatingBill?.method ?? null,
      methodConfidence: heatingBill?.methodConfidence ?? null,
      note: heatingBill?.note ?? '',
      utility,
      electricRate,
      lowIncome: lowIncomeFlag(bills),
      weatherizationBonus: false,
      sizingBonus: false,
    }
    writeProfile(
      mergeMapProfile(
        profileSnapshot(),
        mapProfileFrom({ town, fuel, electric: electricBill, income }),
      ),
    )
    router.push(withDemo(`/verdict?${toQuery(values).toString()}`, demoFromLocation()))
  }

  return (
    <div className="grid gap-8">
      <Stepper step={step} detailsNeeded={detailsNeeded} onJump={(target) => goTo(target)} />

      {step === 'account' ? (
        <section className="rounded-card border border-rule bg-surface p-5 sm:p-6">
          <p className="text-eyebrow uppercase text-ink-muted">{eyebrowFor('account', detailsNeeded)}</p>
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
        <section className="grid gap-5 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">{eyebrowFor('bill', detailsNeeded)}</p>
            <h2 className="mt-2 text-title font-medium">Show us your two bills</h2>
            <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
              Your electric bill, then your heating bill (a gas bill or an oil or propane delivery ticket). We read
              each one, show you what we found, and you confirm it before it touches the verdict.
            </p>
          </div>

          <BillSlot
            title="1. Electric bill"
            done={electricBill !== null || electricByHand}
            byHand={electricByHand}
            onByHand={() => setElectricByHand(true)}
            onUndoByHand={() => setElectricByHand(false)}
            byHandLabel="No electric bill handy? Use the statewide average rate"
            byHandNote="Using the statewide average electricity rate. A bill gives a sharper answer."
          >
            <BillUpload
              expect="electricity"
              onApply={(applied) => applyBill(applied, 'electricity')}
              onUndo={undoBill}
              countyFips={townKnown ? countyOfTown(town)?.fips : undefined}
              samples={DEMO_BILL_SAMPLES}
              offerElectric={false}
            />
            {slotNote?.slot === 'electricity' ? <p className="text-micro text-deadline">{slotNote.text}</p> : null}
            {electricBill ? (
              <p className="text-micro text-ink-muted">
                ${electricBill.electricRate ?? electricBill.price}/kWh
                {electricBill.utility ? ` from ${UTILITY_LABEL[electricBill.utility]}` : ''}. The verdict uses your own
                rate instead of the statewide average.
              </p>
            ) : null}
          </BillSlot>

          <BillSlot
            title="2. Heating bill"
            done={heatingBill !== null || heatingByHand}
            byHand={heatingByHand}
            onByHand={enterHeatingByHand}
            onUndoByHand={() => setHeatingByHand(false)}
            byHandLabel="No heating bill handy? Enter the numbers myself"
            byHandNote="You will type the fuel, the yearly amount and the price on the next screen."
          >
            <BillUpload
              onApply={(applied) => applyBill(applied, 'heating')}
              onUndo={undoBill}
              countyFips={townKnown ? countyOfTown(town)?.fips : undefined}
              samples={DEMO_BILL_SAMPLES}
              offerElectric={false}
            />
            {slotNote?.slot === 'heating' ? <p className="text-micro text-deadline">{slotNote.text}</p> : null}
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
          </BillSlot>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => goTo(previousStep('bill'))}
              className="rounded-pill border border-rule-strong px-4 py-2.5 text-small text-ink-muted hover:border-ink hover:text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => goTo(nextStep('bill', detailsNeeded))}
              disabled={!billsReady(slots)}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper disabled:opacity-40"
            >
              Continue
            </button>
            {!billsReady(slots) ? <p className="text-micro text-ink-faint">Both bills are needed to continue.</p> : null}
          </div>
        </section>
      ) : null}

      {step === 'details' ? (
        <section className="grid gap-5 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">{eyebrowFor('details', detailsNeeded)}</p>
            <h2 className="mt-2 text-title font-medium">A few things the bills did not say</h2>
          </div>

          {billTown && !editingTown ? (
            <div className="grid gap-1">
              <h3 className="text-small font-medium">Where is the house?</h3>
              <p className="text-small text-ink">
                {town}{' '}
                <button type="button" onClick={() => setEditingTown(true)} className="text-micro text-ink-muted underline">
                  Change
                </button>
              </p>
              <p className="text-micro text-ink-faint">Read from your bill.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              <h3 className="text-small font-medium">Where is the house?</h3>
              <AddressCombobox
                onSelect={(suggestion) => {
                  const matched = matchTown(suggestion.town, towns)
                  if (matched) {
                    setTownPick(matched)
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
                  onChange={(event) => setTownPick(event.target.value)}
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
              {editingTown ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTown(false)
                    setTownPick(null)
                  }}
                  className="justify-self-start text-micro text-ink-muted underline"
                >
                  Use the town from my bill
                </button>
              ) : null}
            </div>
          )}

          {needs.fuel || needs.numbers ? (
            <div className="grid gap-3">
              <h3 className="text-small font-medium">What do you burn, and how much in a year?</h3>
              {needs.fuel ? (
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
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={unitLabel}>
                  <input
                    value={units}
                    onChange={(event) => setUnits(event.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 800"
                    className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
                  />
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
                    Today&apos;s statewide price is prefilled; overwrite it with what you actually pay.
                  </span>
                </Field>
              </div>
            </div>
          ) : null}

          {needs.income && fuel !== 'gas' ? (
            <fieldset className="grid gap-3">
              <legend className="text-small font-medium">Is the household under the Mass Save income limit?</legend>
              {incomeDeclined ? (
                <p className="text-small text-ink-muted">
                  Skipped. We will use the standard rebate until you check with Mass Save.{' '}
                  <button type="button" onClick={() => setIncomeDeclined(false)} className="underline">
                    Answer instead
                  </button>
                </p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="People in the household">
                      <select
                        value={householdSize ?? ''}
                        onChange={(event) => setHouseholdSize(event.target.value === '' ? null : Number(event.target.value))}
                        className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
                      >
                        <option value="">Choose…</option>
                        {Array.from({ length: HOUSEHOLD_SIZE_MAX }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>
                            {count === HOUSEHOLD_SIZE_MAX ? `${count} or more` : count}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Estimated yearly household income" hint="Before taxes. Kept in this session only.">
                      <input
                        value={incomeText}
                        onChange={(event) => setIncomeText(event.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="e.g. 85,000"
                        className="rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums"
                      />
                    </Field>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeDeclined(true)
                        setIncomeText('')
                        setHouseholdSize(null)
                      }}
                      className="rounded-pill border border-rule-strong px-3.5 py-2 text-small text-ink-muted hover:border-ink hover:text-ink"
                    >
                      Prefer not to say
                    </button>
                  </div>
                  {incomeText.trim() !== '' && estimatedIncome === null ? (
                    <p className="text-micro text-deadline">Enter a number like 85000 or 85k.</p>
                  ) : null}
                  {incomeResult ? (
                    <p className="text-small text-ink" role="status">
                      {incomeResult}
                    </p>
                  ) : null}
                </>
              )}
              <p className="text-micro text-ink-faint">
                An estimate, not a decision. Check eligibility:{' '}
                <a href="tel:8887143990" className="underline">
                  {MASS_SAVE_PHONE}
                </a>
                . Not sure counts as the standard rebate.
              </p>
            </fieldset>
          ) : null}

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
            <p className="text-eyebrow uppercase text-ink-muted">{eyebrowFor('review', detailsNeeded)}</p>
            <h2 className="mt-2 text-title font-medium">Check it once, then we answer.</h2>
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

            <SummaryRow term="Town" badge={<FreshnessBadge kind={billTown && town === billTown ? 'bill' : 'manual'} />}>
              {town}
              {utility ? ` · ${UTILITY_LABEL[utility]}` : ''}
            </SummaryRow>

            {electricRate ? (
              <SummaryRow term="Electricity price" badge={<FreshnessBadge kind="bill" />}>
                ${electricRate}/kWh
              </SummaryRow>
            ) : null}

            <SummaryRow term="Income limit" badge={<FreshnessBadge kind={incomeDetected ? 'bill' : 'manual'} />}>
              {incomeDetected ? (
                <>
                  <span>Likely under the limit.</span>{' '}
                  <span className="text-micro text-ink-muted">{incomeNote(fuel)}</span>
                </>
              ) : income === 'yes' ? (
                'Under the limit, as you said'
              ) : income === 'no' ? (
                'Not under the limit'
              ) : (
                'Not sure'
              )}
            </SummaryRow>
          </dl>

          {mismatch && town === mismatch.used ? (
            <p className="text-micro text-ink-muted">
              Your bills show two towns; we used {mismatch.used} from the electric bill.{' '}
              <button
                type="button"
                onClick={() => {
                  setEditingTown(true)
                  goTo('details')
                }}
                className="underline"
              >
                Change
              </button>
            </p>
          ) : null}

          {!detailsReady ? (
            <p className="text-micro text-deadline">
              The town, the yearly amount or the price is missing or not a positive number.{' '}
              <button type="button" onClick={() => goTo('details')} className="underline">
                Fix it
              </button>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => goTo(previousStep('review', detailsNeeded))}
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
          </div>
        </section>
      ) : null}
    </div>
  )
}


function Stepper({ step, detailsNeeded, onJump }: { step: Step; detailsNeeded: boolean; onJump: (step: Step) => void }) {
  const steps = visibleSteps(detailsNeeded)
  const current = Math.max(0, steps.findIndex((entry) => entry.id === step))
  return (
    <nav aria-label="Your progress">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 text-micro sm:flex sm:flex-wrap sm:gap-x-6 sm:text-small">
        {steps.map((entry, index) => {
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
        Step {current + 1} of {steps.length}: {steps[current].label}
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

function incomeNote(fuel: BillFuel): string {
  return fuel === 'gas'
    ? 'Your bill shows a discount rate. Mass Save confirms which rebates you qualify for.'
    : 'Your bill shows a discount rate, so you likely qualify for enhanced rebates — Mass Save confirms.'
}

function BillSlot({
  title,
  done,
  byHand,
  onByHand,
  onUndoByHand,
  byHandLabel,
  byHandNote,
  children,
}: {
  title: string
  done: boolean
  byHand: boolean
  onByHand: () => void
  onUndoByHand: () => void
  byHandLabel: string
  byHandNote: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 text-small font-medium">
        {title}
        {done ? <span className="text-micro text-switch">✓ in</span> : null}
      </h3>
      {byHand ? (
        <p className="text-micro text-ink-muted">
          {byHandNote}{' '}
          <button type="button" onClick={onUndoByHand} className="underline">
            Upload a bill instead
          </button>
        </p>
      ) : (
        <>
          {children}
          {!done ? (
            <button type="button" onClick={onByHand} className="justify-self-start text-micro text-ink-muted underline">
              {byHandLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
