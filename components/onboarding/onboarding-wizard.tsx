'use client'

import { cloneElement, useId, useSyncExternalStore, useState } from 'react'
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
  canLeaveDetails,
  detailsBlocker,
  detailsNeeds,
  discountLineNeedsConfirm,
  eyebrowFor,
  stepsFor,
  isProfileComplete,
  lowIncomeDetected,
  hasSingleSponsor,
  lowIncomeFlag,
  misplacedBillNote,
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
  withoutProfile,
  writeProfile,
  type Profile,
  type Step,
} from '@/lib/onboarding/flow'
import {
  EMPTY_SLOT,
  billOf,
  electricEntryErrors,
  electricEntryFacts,
  electricEntryFrom,
  electricForMap,
  heatingEntryErrors,
  heatingEntryFrom,
  isElectricReady,
  isHeatingReady,
  isSlotSaved,
  heatingFacts,
  missingNotice,
  replacesTypedEntry,
  saveElectric,
  saveHeating,
  settleSlots,
  slotsReady,
  type ElectricEntry,
  type ElectricSlot,
  type HeatingEntry,
  type HeatingSlot,
} from '@/lib/onboarding/slots'
import { townAddressReason, townFromAddress } from '@/lib/onboarding/town-from-address'
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
  const [heatingSlot, setHeatingSlot] = useState<HeatingSlot>(EMPTY_SLOT)
  const [electricSlot, setElectricSlot] = useState<ElectricSlot>(EMPTY_SLOT)
  const [slotNote, setSlotNote] = useState<{ slot: BillRole; text: string } | null>(null)

  // ---------------------------------------------------------------- the house
  const [townPick, setTownPick] = useState<string | null>(null)
  const [editingTown, setEditingTown] = useState(false)
  const [manualFuel, setManualFuel] = useState<BillFuel>('oil')
  const [householdSize, setHouseholdSize] = useState<number | null>(null)
  const [incomeText, setIncomeText] = useState('')
  const [incomeDeclined, setIncomeDeclined] = useState(false)
  const [addressNote, setAddressNote] = useState<string | null>(null)
  const [addressText, setAddressText] = useState('')
  const [pickingTown, setPickingTown] = useState(false)
  const [detailsAttempted, setDetailsAttempted] = useState(false)
  const [savedDetailsKey, setSavedDetailsKey] = useState<string | null>(null)
  const [discountConfirmed, setDiscountConfirmed] = useState(false)
  const [slotErrors, setSlotErrors] = useState<{ heating: Record<string, string>; electric: Record<string, string> }>({
    heating: {},
    electric: {},
  })
  const [pendingBill, setPendingBill] = useState<{ applied: BillApplied; slot: BillRole } | null>(null)

  const [step, setStep] = useState<Step>('account')

  const heatingBill = billOf(heatingSlot)
  const electricBill = billOf(electricSlot)
  const bills = [electricBill, heatingBill] as const
  const billTown = serviceTownFrom(bills, towns)
  const typedAddress = townFromAddress(addressText, towns)
  const typedTown = typedAddress.kind === 'matched' ? typedAddress.town : null
  const town = townPick ?? typedTown ?? billTown ?? ''
  const facts = heatingFacts(heatingSlot)
  const fuel: BillFuel = facts?.fuel ?? manualFuel
  const units = facts?.units ?? ''
  const price = facts?.price ?? ''
  const discountAsk = discountLineNeedsConfirm(bills)
  const incomeDetected = lowIncomeDetected(bills) || (discountAsk && discountConfirmed)
  const estimatedIncome = incomeDeclined ? null : parseIncome(incomeText)
  const income: Income = incomeDetected
    ? 'yes'
    : fuel === 'gas'
      ? 'unsure'
      : eligibilityFor(householdSize, estimatedIncome)
  const incomeResult = incomeDeclined ? null : incomeResultCopy(householdSize, estimatedIncome)
  const electricTyped = electricEntryFacts(electricSlot)
  const utility =
    electricSlot.kind === 'manual'
      ? electricTyped.utility
      : pickUtility(electricBill, heatingBill, hasSingleSponsor(town))
  const mismatch = townMismatch(electricBill, heatingBill, towns)
  const electricRate =
    electricSlot.kind === 'manual'
      ? electricTyped.rate
      : ([electricBill?.electricRate, heatingBill?.electricRate].find(
          (rate): rate is string => typeof rate === 'string' && plausibleElectricRate(rate) !== null,
        ) ?? '')
  const needs = detailsNeeds({
    townRead: billTown !== null && town !== '' && !editingTown,
    fuel: facts?.fuel ?? null,
    incomeDetected,
  })
  const billsOk = slotsReady(heatingSlot, electricSlot)
  const notice = missingNotice(heatingSlot, electricSlot)

  const marketPrice: Partial<Record<BillFuel, number>> = {
    oil: prices.oil,
    propane: prices.propane,
    resistance: prices.elec,
  }

  const townKnown = towns.includes(town)
  const detailsReady = facts !== null && canLeaveDetails({ fuel, units, price, town, towns })
  const detailsNeeded = anyDetailsNeeded(needs) || (discountAsk && !discountConfirmed) || !detailsReady
  const blocker = detailsBlocker({ fuel, units, price, town, towns })
  const detailsKey = `${town}|${fuel}|${incomeDetected}|${householdSize}|${incomeText}|${incomeDeclined}`
  const detailsSaved = savedDetailsKey === detailsKey
  const townReason =
    typedTown === null && townPick === null && addressText.trim().length >= 6 ? townAddressReason(typedAddress) : null
  const townHighlight = town === '' && (townReason !== null || detailsAttempted)
  const townFromTyped = typedTown !== null && townPick === null && !pickingTown

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
    if (replacesTypedEntry(applied.role, slot, heatingSlot, electricSlot)) {
      setPendingBill({ applied, slot })
      return
    }
    commitBill(applied, slot)
  }

  function commitBill(applied: BillApplied, slot: BillRole) {
    setPendingBill(null)
    const text = misplacedBillNote(slot, applied.role)
    setSlotNote(text ? { slot, text } : null)
    if (applied.role === 'electricity') setElectricSlot({ kind: 'bill', bill: applied })
    else setHeatingSlot({ kind: 'bill', bill: applied })
  }

  function undoBill(role: BillRole) {
    setSlotNote(null)
    if (role === 'heating' && heatingSlot.kind === 'bill') setHeatingSlot(EMPTY_SLOT)
    else if (role === 'electricity' && electricSlot.kind === 'bill') setElectricSlot(EMPTY_SLOT)
  }

  function keepTypedEntry() {
    if (!pendingBill) return
    const kept = pendingBill.applied.role === 'heating' ? 'heating' : 'electricity'
    setSlotNote({ slot: pendingBill.slot, text: `Kept the ${kept} numbers you typed. That bill was not used.` })
    setPendingBill(null)
  }

  function saveHeatingEntry() {
    const result = saveHeating(heatingSlot)
    setHeatingSlot(result.slot as HeatingSlot)
    setSlotErrors((previous) => ({ ...previous, heating: result.errors }))
  }

  function saveElectricEntry() {
    const result = saveElectric(electricSlot)
    setElectricSlot(result.slot as ElectricSlot)
    setSlotErrors((previous) => ({ ...previous, electric: result.errors }))
  }

  function continueFromBills() {
    if (!billsOk) return
    const settled = settleSlots(heatingSlot, electricSlot)
    setHeatingSlot(settled.heating)
    setElectricSlot(settled.electric)
    goTo(nextStep('bill', detailsNeeded))
  }

  function saveDetails() {
    setDetailsAttempted(true)
    if (blocker === null) setSavedDetailsKey(detailsKey)
  }

  function reviewDetails() {
    setDetailsAttempted(true)
    if (blocker !== null) return
    setSavedDetailsKey(detailsKey)
    goTo('review')
  }

  function heatingDefaults(nextFuel: BillFuel): HeatingEntry {
    const market = marketPrice[nextFuel]
    return { fuel: nextFuel, units: '', price: market ? String(market) : '' }
  }

  function typeHeatingByHand() {
    setSlotNote(null)
    setHeatingSlot({ kind: 'manual', entry: heatingEntryFrom(heatingSlot, heatingDefaults(manualFuel)) })
  }

  function chooseHeatingFuel(entry: HeatingEntry, nextFuel: BillFuel) {
    const marketNow = marketPrice[entry.fuel]
    const untouched = entry.price.trim() === '' || (marketNow !== undefined && Number(entry.price) === marketNow)
    const market = marketPrice[nextFuel]
    setManualFuel(nextFuel)
    setHeatingSlot({
      kind: 'manual',
      entry: { ...entry, fuel: nextFuel, price: untouched ? (market ? String(market) : '') : entry.price },
    })
  }

  function typeElectricByHand() {
    setSlotNote(null)
    setElectricSlot({ kind: 'manual', entry: electricEntryFrom(electricSlot) })
  }

  function chooseFuel(next: BillFuel) {
    setManualFuel(next)
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
      lowIncome: incomeDetected ? true : lowIncomeFlag(bills),
      weatherizationBonus: false,
      sizingBonus: false,
    }
    writeProfile(
      mergeMapProfile(
        profileSnapshot(),
        mapProfileFrom({
          town,
          fuel,
          electric: electricForMap(electricSlot),
          income,
        }),
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
            <h2 className="mt-2 text-title font-medium">Your electricity and heating</h2>
            <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
              For each one, upload a bill or type the numbers in — any mix works. We read a bill, show you what we
              found, and you confirm it before it touches the verdict.
            </p>
          </div>

          <BillSlot
            title="1. Electricity"
            done={isElectricReady(electricSlot) && isSlotSaved(electricSlot)}
            manual={electricSlot.kind === 'manual'}
            onManual={typeElectricByHand}
            onUpload={() => setElectricSlot(EMPTY_SLOT)}
            manualForm={
              electricSlot.kind === 'manual' ? (
                <ElectricForm
                  entry={electricSlot.entry}
                  saved={isSlotSaved(electricSlot)}
                  saveErrors={slotErrors.electric}
                  onSave={saveElectricEntry}
                  onChange={(entry) => {
                    setSlotErrors((previous) => ({ ...previous, electric: {} }))
                    setElectricSlot({ kind: 'manual', entry })
                  }}
                />
              ) : null
            }
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
            title="2. Heating"
            done={isHeatingReady(heatingSlot) && isSlotSaved(heatingSlot)}
            manual={heatingSlot.kind === 'manual'}
            onManual={typeHeatingByHand}
            onUpload={() => setHeatingSlot(EMPTY_SLOT)}
            manualForm={
              heatingSlot.kind === 'manual' ? (
                <HeatingForm
                  entry={heatingSlot.entry}
                  saved={isSlotSaved(heatingSlot)}
                  saveErrors={slotErrors.heating}
                  onSave={saveHeatingEntry}
                  onFuel={(next) => chooseHeatingFuel(heatingSlot.entry, next)}
                  onChange={(entry) => {
                    setSlotErrors((previous) => ({ ...previous, heating: {} }))
                    setHeatingSlot({ kind: 'manual', entry })
                  }}
                />
              ) : null
            }
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

          {pendingBill ? (
            <div role="alertdialog" aria-label="Replace typed numbers" className="rounded-card border border-rule-strong bg-paper-sunk/60 p-3">
              <p className="text-small text-ink">
                That is a {pendingBill.applied.role === 'heating' ? 'heating' : 'electric'} bill, and you already typed{' '}
                {pendingBill.applied.role === 'heating' ? 'heating' : 'electricity'} numbers. Replace them with the bill?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => commitBill(pendingBill.applied, pendingBill.slot)}
                  className="rounded-pill bg-ink px-4 py-2 text-small font-medium text-paper"
                >
                  Replace with the bill
                </button>
                <button
                  type="button"
                  onClick={keepTypedEntry}
                  className="rounded-pill border border-rule-strong px-4 py-2 text-small text-ink-muted hover:border-ink hover:text-ink"
                >
                  Keep what I typed
                </button>
              </div>
            </div>
          ) : null}

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
              onClick={continueFromBills}
              disabled={!billsOk}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper disabled:opacity-40"
            >
              Continue
            </button>
            <p className="text-micro text-ink-faint" role="status">
              {notice}
            </p>
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
              <div
                onInput={(event) => {
                  const target = event.target as HTMLInputElement
                  if (target.id !== 'address') return
                  setAddressText(target.value)
                  setTownPick(null)
                  setPickingTown(false)
                }}
              >
                <AddressCombobox
                  onSelect={(suggestion) => {
                    const matched = matchTown(suggestion.town, towns)
                    setAddressText(suggestion.label)
                    if (matched) {
                      setTownPick(matched)
                      setPickingTown(false)
                      setAddressNote(suggestion.label)
                    } else {
                      setAddressNote('That address is outside the 351 towns. Pick your town below.')
                    }
                  }}
                  onTyped={(value) => void lookupTypedAddress(value)}
                />
              </div>
              {addressNote ? <p className="text-micro text-ink-muted">{addressNote}</p> : null}
              {townFromTyped || (town !== '' && !pickingTown && townPick !== null) ? (
                <p className="text-small text-ink" role="status">
                  Town: {town} <span aria-hidden>✓</span>
                  <span className="sr-only">found</span>{' '}
                  <button type="button" onClick={() => setPickingTown(true)} className="text-micro text-ink-muted underline">
                    (change)
                  </button>
                </p>
              ) : (
                <label className="grid max-w-sm gap-1.5 text-small">
                  <span className="font-medium">Which town?</span>
                  <select
                    value={town}
                    onChange={(event) => {
                      setTownPick(event.target.value === '' ? null : event.target.value)
                      if (event.target.value !== '') setPickingTown(false)
                    }}
                    aria-invalid={townHighlight ? true : undefined}
                    aria-describedby={townHighlight ? 'town-reason' : undefined}
                    className={`rounded-card border bg-surface px-3 py-2.5 ${
                      townHighlight ? 'border-deadline ring-1 ring-deadline' : 'border-rule-strong'
                    }`}
                  >
                    <option value="">Choose a town…</option>
                    {towns.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {townHighlight ? (
                    <span id="town-reason" className="text-micro text-deadline">
                      {townReason ?? 'Add your town to continue.'}
                    </span>
                  ) : null}
                </label>
              )}
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

          {discountAsk ? (
            <label className="flex max-w-[62ch] cursor-pointer items-start gap-2.5 text-small text-ink">
              <input
                type="checkbox"
                checked={discountConfirmed}
                onChange={(event) => setDiscountConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                Your bill seems to show a discount rate — is that right?
                <span className="block text-micro text-ink-muted">
                  Tick it to count as under the income limit. Leave it empty and we ask the income question instead.
                </span>
              </span>
            </label>
          ) : null}

          {needs.fuel ? (
            <div className="grid gap-3">
              <h3 className="text-small font-medium">What do you heat with?</h3>
              <FuelPicker value={fuel} onChange={chooseFuel} />
              <p className="text-micro text-ink-faint">Your bill did not name the fuel.</p>
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
              onClick={saveDetails}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
            >
              Save
            </button>
            <button
              type="button"
              onClick={reviewDetails}
              disabled={blocker !== null}
              className="rounded-pill border border-ink px-5 py-2.5 text-small font-medium text-ink disabled:opacity-40"
            >
              Review
            </button>
            {blocker !== null ? (
              <p className="text-micro text-deadline" role="status">
                {blocker}
              </p>
            ) : detailsSaved ? (
              <p className="text-micro text-switch" role="status">
                Saved <span aria-hidden>✓</span>
              </p>
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
              {blocker}{' '}
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
  const steps = stepsFor(step, detailsNeeded)
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
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>
}) {
  const id = useId()
  const noteId = `${id}-note`
  const note = error ?? hint
  return (
    <div className="grid gap-1.5 text-small">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': note ? noteId : undefined,
      })}
      {note ? (
        <span id={noteId} className={`text-micro ${error ? 'text-deadline' : 'text-ink-faint'}`}>
          {note}
        </span>
      ) : null}
    </div>
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

function FuelPicker({ value, onChange }: { value: BillFuel; onChange: (fuel: BillFuel) => void }) {
  return (
    <div role="radiogroup" aria-label="Heating fuel" className="flex flex-wrap gap-2">
      {FUELS.map((entry) => {
        const active = entry.value === value
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(entry.value)}
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
  )
}

const INPUT = 'rounded-card border border-rule-strong bg-surface px-3 py-2.5 tabular-nums'

function SaveRow({ saved, onSave, errors }: { saved: boolean; onSave: () => void; errors: Record<string, string> }) {
  const failed = Object.keys(errors).length > 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onSave} className="rounded-pill bg-ink px-5 py-2 text-small font-medium text-paper">
        Save
      </button>
      {saved ? (
        <p className="text-micro text-switch" role="status">
          Saved <span aria-hidden>✓</span>
        </p>
      ) : failed ? (
        <p className="text-micro text-deadline" role="status">
          Fix the highlighted numbers to save.
        </p>
      ) : null}
    </div>
  )
}

function HeatingForm({
  entry,
  saved,
  saveErrors,
  onSave,
  onFuel,
  onChange,
}: {
  entry: HeatingEntry
  saved: boolean
  saveErrors: Record<string, string>
  onSave: () => void
  onFuel: (fuel: BillFuel) => void
  onChange: (entry: HeatingEntry) => void
}) {
  const errors = heatingEntryErrors(entry)
  const [touched, setTouched] = useState(false)
  const unit = FUELS.find((candidate) => candidate.value === entry.fuel)?.unit ?? 'Units a year'
  const perUnit = entry.fuel === 'gas' ? 'therm' : entry.fuel === 'resistance' ? 'kWh' : 'gallon'
  return (
    <div className="grid gap-3 rounded-card border border-rule bg-paper-sunk/60 p-3">
      <FuelPicker value={entry.fuel} onChange={onFuel} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={unit} error={saveErrors.units ?? (touched ? errors.units : undefined)}>
          <input
            value={entry.units}
            onChange={(event) => {
              setTouched(true)
              onChange({ ...entry, units: event.target.value })
            }}
            inputMode="decimal"
            placeholder="e.g. 800"
            className={INPUT}
          />
        </Field>
        <Field
          label={`Price per ${perUnit}`}
          error={saveErrors.price ?? (touched ? errors.price : undefined)}
          hint="Today's statewide price is prefilled where we have one; overwrite it with what you pay."
        >
          <input
            value={entry.price}
            onChange={(event) => {
              setTouched(true)
              onChange({ ...entry, price: event.target.value })
            }}
            inputMode="decimal"
            placeholder="e.g. 4.50"
            className={INPUT}
          />
        </Field>
      </div>
      <SaveRow saved={saved} onSave={onSave} errors={saveErrors} />
    </div>
  )
}

const UTILITY_CHOICES: readonly BillUtility[] = ['eversource', 'national_grid', 'unitil', 'liberty', 'municipal', 'other']

function ElectricForm({
  entry,
  saved,
  saveErrors,
  onSave,
  onChange,
}: {
  entry: ElectricEntry
  saved: boolean
  saveErrors: Record<string, string>
  onSave: () => void
  onChange: (entry: ElectricEntry) => void
}) {
  const errors = electricEntryErrors(entry)
  return (
    <div className="grid gap-3 rounded-card border border-rule bg-paper-sunk/60 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Electric company" hint="Optional.">
          <select
            value={entry.utility ?? ''}
            onChange={(event) =>
              onChange({ ...entry, utility: event.target.value === '' ? null : (event.target.value as BillUtility) })
            }
            className="rounded-card border border-rule-strong bg-surface px-3 py-2.5"
          >
            <option value="">Not sure</option>
            {UTILITY_CHOICES.map((value) => (
              <option key={value} value={value}>
                {UTILITY_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price per kWh" error={errors.rate} hint="Leave empty to use the statewide average rate.">
          <input
            value={entry.rate}
            onChange={(event) => onChange({ ...entry, rate: event.target.value })}
            inputMode="decimal"
            placeholder="e.g. 0.31"
            className={INPUT}
          />
        </Field>
        <Field label="kWh a month" error={errors.monthlyKwh} hint="Optional.">
          <input
            value={entry.monthlyKwh}
            onChange={(event) => onChange({ ...entry, monthlyKwh: event.target.value })}
            inputMode="decimal"
            placeholder="e.g. 600"
            className={INPUT}
          />
        </Field>
      </div>
      <SaveRow saved={saved} onSave={onSave} errors={saveErrors} />
    </div>
  )
}

function BillSlot({
  title,
  done,
  manual,
  onManual,
  onUpload,
  manualForm,
  children,
}: {
  title: string
  done: boolean
  manual: boolean
  onManual: () => void
  onUpload: () => void
  manualForm: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3">
      <h3 className="flex items-center gap-2 text-small font-medium">
        {title}
        {done ? (
          <span className="text-micro text-switch">
            <span aria-hidden>✓ in</span>
            <span className="sr-only">added</span>
          </span>
        ) : null}
      </h3>
      {manual ? (
        <>
          {manualForm}
          <button type="button" onClick={onUpload} className="justify-self-start text-micro text-ink-muted underline">
            Upload a bill instead
          </button>
        </>
      ) : (
        <>
          {children}
          <button type="button" onClick={onManual} className="justify-self-start text-micro text-ink-muted underline">
            Type the numbers in instead
          </button>
        </>
      )}
    </div>
  )
}
