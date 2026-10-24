'use client'

/**
 * @built F-74 profile drawer: "My home" fields, saved only in this browser
 */

import { useEffect, useId, useRef, useState } from 'react'
import { ALL_TOWNS, SPONSOR_NAME, resolveUtility } from '@/lib/utility'
import type { SponsorKey } from '@/lib/elec-label'
import type { HeatingFuel, HomeType, Profile, ProfileDrawerProps, SupplyChoice, YesNo, YesNoUnsure } from './types'

const FUEL_OPTIONS: Array<[HeatingFuel, string]> = [
  ['oil', 'Heating oil'],
  ['propane', 'Propane'],
  ['gas', 'Natural gas'],
  ['resistance', 'Electric resistance'],
  ['heat_pump', 'Heat pump'],
]
const HOME_OPTIONS: Array<[HomeType, string]> = [
  ['single', 'Single-family'],
  ['two_to_four', '2 to 4 units'],
  ['condo', 'Condo'],
]
const SUPPLY_OPTIONS: Array<[SupplyChoice, string]> = [
  ['basic', 'Basic Service (the utility)'],
  ['aggregation', 'Municipal aggregation'],
  ['competitive', 'A competitive supplier'],
  ['unsure', 'Not sure'],
]

const FIELD = 'w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink'
const LABEL = 'text-small font-medium text-ink'
const HINT = 'text-micro text-ink-muted'
const BUTTON =
  'rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus'

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => !el.hasAttribute('disabled'))
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ProfileDrawer({ open, onClose, profile, onChange, onClear }: ProfileDrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const id = useId()
  const [kwhDraft, setKwhDraft] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = ref.current
    if (root) (focusables(root)[0] ?? root).focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  const resolved = profile.town ? resolveUtility(profile.town) : null
  const mixedTown = resolved?.found && resolved.mixed ? resolved : null
  const utilityName = resolved?.found && !resolved.mixed ? resolved.sponsors.map((s) => SPONSOR_NAME[s]).join(', ') : null
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ [key]: value } as Partial<Profile>)

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = focusables(ref.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-rule bg-paper p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-title font-medium text-ink">
            My home
          </h2>
          <button type="button" className={BUTTON} onClick={onClose}>
            Close
          </button>
        </header>
        <p className={HINT}>Saved only in this browser. Don&apos;t enter your account number.</p>

        <div className="flex flex-col gap-1">
          <span className={LABEL}>Address</span>
          {profile.address ? (
            <div className="flex items-start justify-between gap-3">
              <p className="text-small text-ink">{profile.address}</p>
              <button type="button" className={BUTTON} onClick={() => set('address', '')}>
                Clear address
              </button>
            </div>
          ) : (
            <p className={HINT}>None. Set it with the search on the map, or pick your town below.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-town`} className={LABEL}>
            Town
          </label>
          <select
            id={`${id}-town`}
            className={FIELD}
            value={profile.town}
            onChange={(e) => onChange({ town: e.target.value, utility: null })}
          >
            <option value="">Choose a town</option>
            {ALL_TOWNS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          {mixedTown ? (
            <>
              <label htmlFor={`${id}-utility`} className={LABEL}>
                Which utility bills you?
              </label>
              <select
                id={`${id}-utility`}
                required
                className={FIELD}
                value={profile.utility ?? ''}
                onChange={(e) => set('utility', (e.target.value || null) as SponsorKey | null)}
              >
                <option value="">Choose one (required)</option>
                {mixedTown.sponsors.map((s) => (
                  <option key={s} value={s}>
                    {SPONSOR_NAME[s]}
                  </option>
                ))}
              </select>
              <p className={HINT}>More than one utility serves {mixedTown.town}. It depends on your address.</p>
            </>
          ) : (
            <>
              <span className={LABEL}>Electric utility</span>
              <p className="text-small text-ink">
                {utilityName ?? (profile.town ? 'Not found for this town.' : 'Choose a town first.')}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-fuel`} className={LABEL}>
            Heating fuel
          </label>
          <select id={`${id}-fuel`} className={FIELD} value={profile.fuel ?? ''} onChange={(e) => set('fuel', (e.target.value || null) as HeatingFuel | null)}>
            <option value="">Not set</option>
            {FUEL_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-home`} className={LABEL}>
            Home type
          </label>
          <select id={`${id}-home`} className={FIELD} value={profile.home ?? ''} onChange={(e) => set('home', (e.target.value || null) as HomeType | null)}>
            <option value="">Not set</option>
            {HOME_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-kwh`} className={LABEL}>
            Monthly kWh{profile.kwhIsExample ? ' (example, edit me)' : ''}
          </label>
          <input
            id={`${id}-kwh`}
            type="number"
            inputMode="decimal"
            min={0}
            className={`${FIELD} num`}
            value={kwhDraft ?? (profile.kwh > 0 ? String(profile.kwh) : '')}
            onChange={(e) => {
              setKwhDraft(e.target.value)
              // Empty or invalid commits 0, which the bill panel reads as "not set".
              set('kwh', toNumberOrNull(e.target.value) ?? 0)
            }}
            onBlur={() => setKwhDraft(null)}
          />
          <p className={HINT}>Find it on your bill.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-supply`} className={LABEL}>
            Current supply
          </label>
          <select id={`${id}-supply`} className={FIELD} value={profile.supply ?? ''} onChange={(e) => set('supply', (e.target.value || null) as SupplyChoice | null)}>
            <option value="">Not set</option>
            {SUPPLY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {profile.supply === 'competitive' && (
          <fieldset className="flex flex-col gap-4 rounded-card border border-rule p-4">
            <legend className="px-1 text-small text-ink-muted">Your competitive contract</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-rate`} className={LABEL}>
                Supplier rate (¢/kWh)
              </label>
              <input
                id={`${id}-rate`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                className={`${FIELD} num`}
                value={profile.supplierRateCents ?? ''}
                onChange={(e) => set('supplierRateCents', toNumberOrNull(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-end`} className={LABEL}>
                Contract end date
              </label>
              <input
                id={`${id}-end`}
                type="date"
                className={`${FIELD} num`}
                value={profile.contractEnd ?? ''}
                onChange={(e) => set('contractEnd', e.target.value || null)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-etf`} className={LABEL}>
                Early termination fee ($)
              </label>
              <input
                id={`${id}-etf`}
                type="number"
                inputMode="decimal"
                min={0}
                className={`${FIELD} num`}
                value={profile.terminationFeeUsd ?? ''}
                onChange={(e) => set('terminationFeeUsd', toNumberOrNull(e.target.value))}
              />
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-solar`} className={LABEL}>
            Solar panels
          </label>
          <select id={`${id}-solar`} className={FIELD} value={profile.solar ?? ''} onChange={(e) => set('solar', (e.target.value || null) as YesNo | null)}>
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-ev`} className={LABEL}>
            Electric vehicle
          </label>
          <select id={`${id}-ev`} className={FIELD} value={profile.ev ?? ''} onChange={(e) => set('ev', (e.target.value || null) as YesNo | null)}>
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-income`} className={LABEL}>
            Income-eligible
          </label>
          <select
            id={`${id}-income`}
            className={FIELD}
            value={profile.incomeEligible ?? ''}
            onChange={(e) => set('incomeEligible', (e.target.value || null) as YesNoUnsure | null)}
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unsure">Not sure</option>
          </select>
          <p className={HINT}>Mass Save decides eligibility. Call 888-714-3990 to check.</p>
        </div>

        <footer className="mt-auto flex gap-3 border-t border-rule pt-4">
          <button type="button" className={BUTTON} onClick={onClose}>
            Close
          </button>
          <button type="button" className={BUTTON} onClick={onClear}>
            Clear profile
          </button>
        </footer>
      </div>
    </div>
  )
}
