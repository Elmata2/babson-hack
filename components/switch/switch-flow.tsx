'use client'

import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'

import { FreshnessBadge } from '@/components/freshness-badge'
import { CHOICE_COPY, kindOf } from '@/lib/switch/choices'
import { DEFAULT_DELIVERY_GALLONS, NEVER_SAID, buildFacts, disclosureRows } from '@/lib/switch/consent'
import type { SwitchModel } from '@/lib/switch/model'
import {
  CONTACT_STATUS_LABEL,
  createSwitch,
  readStoredSwitch,
  serializeSwitch,
  serverSwitchSnapshot,
  subscribeSwitch,
  switchSnapshot,
  writeSwitch,
} from '@/lib/switch/session'
import type {
  BestCaseOutcome,
} from '@/lib/switch/best-case'
import type {
  ContactStatus,
  OutreachResult,
  ProviderStatus,
  SharedFacts,
  SwitchChoice,
  SwitchProvider,
} from '@/lib/switch/types'
import { monthlyDifferenceUsd } from '@/lib/supply'
import { SwitchKit } from './switch-kit'

/**
 * @built F-148 / F-149 the switch flow — best case, decision gate, consent, quotes, decision
 *
 * Addendum B steps 5–6, on the same numbers the verdict screen rendered. Three
 * rules shape the whole screen:
 *
 *  1. Nothing is preselected. `STAY` is a real button with the same weight.
 *  2. Every figure says where it came from and when; no row invents a price.
 *  3. Outreach is opt-in twice: the household ticks providers, reads the exact
 *     facts, then confirms. With no sender configured, no request leaves the page
 *     and the switch kit is the complete path.
 *
 * The browser keeps the request in session storage (see `lib/switch/session.ts`),
 * so `/dashboard` can show the status without a server account.
 */

export interface SwitchFlowProps {
  model: SwitchModel
  providers: SwitchProvider[]
  plan: { mode: 'off' | 'allowlist' | 'live'; reason: string | null; notice: string | null }
}

const OUTCOME: Record<BestCaseOutcome, { label: string; tone: string }> = {
  switch: { label: 'Switch', tone: 'text-switch border-switch-edge bg-switch-tint' },
  stay: { label: 'Stay', tone: 'text-hold border-hold-edge bg-hold-tint' },
  check: { label: 'Check', tone: 'text-deadline border-deadline-edge bg-deadline-tint' },
  available: { label: 'Available', tone: 'text-switch border-switch-edge bg-switch-tint' },
  none: { label: 'Not here', tone: 'text-deadline border-deadline-edge bg-deadline-tint' },
}

function statusTone(status: ContactStatus): string {
  if (status === 'failed') return 'text-deadline border-deadline-edge bg-deadline-tint'
  if (status === 'declined' || status === 'no_answer' || status === 'voicemail') {
    return 'text-hold border-hold-edge bg-hold-tint'
  }
  if (status === 'unsupported' || status === 'scheduled') {
    return 'text-deadline border-deadline-edge bg-deadline-tint'
  }
  return 'text-switch border-switch-edge bg-switch-tint'
}

export function SwitchFlow({ model, providers, plan }: SwitchFlowProps) {
  const [choiceOverride, setChoiceOverride] = useState<SwitchChoice | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [channel, setChannel] = useState<Record<string, 'email' | 'phone'>>({})
  const [zip, setZip] = useState('')
  const [delivery, setDelivery] = useState(String(DEFAULT_DELIVERY_GALLONS))
  const [tank, setTank] = useState('')
  const [deliveryWindow, setDeliveryWindow] = useState('')
  const [outreachOverride, setOutreachOverride] = useState<OutreachResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierCents, setSupplierCents] = useState('')
  const [monthlyKwh, setMonthlyKwh] = useState('')

  // The request is an external store, so it hydrates without an effect and without
  // a cascading render. A request from another house must not show up as this one's.
  const storedRaw = useSyncExternalStore(subscribeSwitch, switchSnapshot, serverSwitchSnapshot)
  const stored = useMemo(() => readStoredSwitch(storedRaw), [storedRaw])
  const liveStored = stored && stored.query === model.query ? stored : null
  const choice = choiceOverride ?? liveStored?.choice ?? null
  const storedStage = liveStored?.stage ?? null
  const outreach: OutreachResult | null =
    outreachOverride ??
    (liveStored && liveStored.statuses.length
      ? {
          ok: true,
          mode: liveStored.statuses.some((status) => status.allowlist) ? 'allowlist' : 'live',
          notice: 'Saved in this tab.',
          statuses: liveStored.statuses,
        }
      : null)

  const facts: SharedFacts = useMemo(
    () =>
      buildFacts({
        town: model.town,
        zip: /^\d{5}$/.test(zip) ? zip : null,
        fuel: model.fuel,
        annualUnits: model.annualUnits,
        sqft: model.sqft,
        tons: model.tons,
        deliverySizeGal: clampDelivery(delivery),
        tankSizeGal: Number(tank) > 0 ? Number(tank) : null,
        deliveryWindow: deliveryWindow.trim() || null,
      }),
    [model.town, model.fuel, model.annualUnits, model.sqft, model.tons, zip, delivery, tank, deliveryWindow],
  )

  // A provider is only actionable when this deployment can actually reach it.
  // With outreach off the list is shown as context in the plan reason instead.
  const contactable = plan.mode === 'off' ? [] : providers
  const selectedProviders = contactable.filter((provider) => picked[provider.id])
  const selectedKind = choice ? kindOf(choice) : 'stay'
  const kitSupply = {
    basicCents: model.supply.basic?.centsPerKwh ?? null,
    basicSource: model.supply.basic
      ? `${model.supply.basic.source} · ${model.supply.basic.sourceDate}`
      : null,
    sponsorLabel: model.supply.sponsorLabel,
    aggregationUrl: model.supply.aggregationUrl,
    energySwitchUrl: model.supply.energySwitchUrl,
  }

  function persist(
    stage: 'consented' | 'contacting' | 'decided',
    decision: 'declined' | 'contacting' | null,
    statuses: ProviderStatus[] = outreach?.statuses ?? [],
  ) {
    if (!choice) return
    const request = createSwitch({
      choice,
      kind: kindOf(choice),
      stage,
      verdict: model.result?.verdict ?? 'UNKNOWN',
      query: model.query,
      facts,
      statuses,
      decision: decision ? { providerId: null, outcome: decision, at: new Date().toISOString() } : null,
      at: new Date(),
    })
    writeSwitch(serializeSwitch(request))
  }

  async function contact() {
    if (!choice || selectedProviders.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        kind: kindOf(choice),
        choice,
        facts,
        providers: selectedProviders.map((provider) => ({
          id: provider.id,
          channel: channel[provider.id] ?? provider.channels[0] ?? 'email',
        })),
        consentAt: new Date().toISOString(),
      }
      const response = await fetch('/api/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as OutreachResult & { message?: string }
      if (!response.ok || payload.ok !== true) {
        setError(payload.message ?? 'That request was refused. Nothing was sent.')
        return
      }
      setOutreachOverride(payload)
      persist(payload.mode === 'off' ? 'consented' : 'contacting', null, payload.statuses)
    } catch {
      setError('The contact route is unreachable. Nothing was sent — the switch kit below still works.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-10">
      {/* ------------------------------------------------------- step five */}
      <section aria-labelledby="best-case">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-eyebrow uppercase text-ink-muted">Step five · Best case</p>
          <Link
            href={`/verdict?${model.query}`}
            className="text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
          >
            ← Back to the verdict
          </Link>
        </div>
        <h2 id="best-case" className="mt-3 text-headline font-medium">
          Where this house stands.
        </h2>
        <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
          Each line is a decision with a reason and a source. We do not say &ldquo;switch&rdquo; where the numbers do
          not support it, and we do not say &ldquo;stay&rdquo; where we simply do not know.
        </p>

        <dl className="mt-6 grid gap-3 md:grid-cols-2">
          {model.bestCase.map((row) => (
            <div key={row.id} className="rounded-card border border-rule bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-eyebrow uppercase text-ink-muted">{row.label}</dt>
                <OutcomeChip outcome={row.outcome} />
              </div>
              <dd className="mt-2">
                <p className="text-small font-medium text-ink">{row.headline}</p>
                <p className="mt-1 text-small text-ink-muted">{row.detail}</p>
                <p className="mt-2 text-micro text-ink-faint">{row.source}</p>
              </dd>
            </div>
          ))}
        </dl>

        {model.alreadyBest ? (
          <p className="mt-4 rounded-card border border-switch-edge bg-switch-tint p-4 text-small text-ink">
            <span className="font-medium">You&rsquo;re already on the best option.</span> We&rsquo;ll tell you if that
            changes — the break-even price and the January step-down are below with the choices.
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------- step six */}
      <section aria-labelledby="decision" className="rounded-card border border-rule bg-surface p-5 sm:p-6">
        <p className="text-eyebrow uppercase text-ink-muted">Step six · What happens next</p>
        <h2 id="decision" className="mt-2 text-title font-medium">
          {model.choices.length} ways forward. Nothing is preselected.
        </h2>
        <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
          Picking one only opens it. No call is placed, no email is sent, and no provider sees anything until you read
          the facts and confirm.
        </p>

        <div role="group" aria-label="What would you like to do?" className="mt-5 grid gap-2 sm:grid-cols-2">
          {model.result?.verdict === 'DO_NOT_SWITCH_YET' ? (
            <p className="rounded-card border border-hold-edge bg-hold-tint p-3 text-small text-ink sm:col-span-2">
              <span className="font-medium">The verdict above stands: don&rsquo;t switch yet.</span>{' '}
              {model.result.breakEvenElectricPrice === null
                ? 'The break-even price could not be computed.'
                : `Break-even electricity is ${(model.result.breakEvenElectricPrice * 100).toFixed(1)}¢/kWh; above it, the heat pump costs you money.`}{' '}
              A quote is still worth having — it may change the install cost, not the running cost.
            </p>
          ) : null}
          {model.choices.map((option) => {
            const active = choice === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setChoiceOverride(option)
                  setOutreachOverride(null)
                  setError(null)
                }}
                className={`rounded-card border p-4 text-left transition-colors ${
                  active ? 'border-ink bg-paper-sunk' : 'border-rule-strong bg-surface hover:border-ink'
                }`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-small font-medium text-ink">{CHOICE_COPY[option].label}</span>
                  <span aria-hidden className={active ? 'text-ink' : 'text-ink-faint'}>
                    {active ? '●' : '○'}
                  </span>
                </span>
                <span className="mt-1 block text-micro text-ink-muted">{CHOICE_COPY[option].detail}</span>
              </button>
            )
          })}
        </div>

        {choice === null ? (
          <p className="mt-3 text-micro text-ink-faint">Pick one to see what it involves. Picking is not agreeing.</p>
        ) : null}
      </section>

      {choice === 'STAY' ? (
        <StayPanel model={model} onSave={() => persist('decided', 'declined')} saved={storedStage === 'decided'} />
      ) : null}

      {choice === 'SHOP_SUPPLY' ? (
        <SupplyPanel
          model={model}
          supplierCents={supplierCents}
          monthlyKwh={monthlyKwh}
          onSupplierCents={setSupplierCents}
          onMonthlyKwh={setMonthlyKwh}
          onRecord={() => persist('decided', 'contacting')}
          saved={storedStage === 'decided'}
        />
      ) : null}

      {choice === 'SHOP_FUEL' || choice === 'SWITCH_HEAT_PUMP' ? (
        <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
          <div>
            <p className="text-eyebrow uppercase text-ink-muted">
              {selectedKind === 'fuel' ? 'Heating fuel' : 'Heat pump'} · consent
            </p>
            <h2 className="mt-2 text-title font-medium">
              {selectedKind === 'fuel' ? 'What a dealer would hear' : 'What an installer would hear'}
            </h2>
            <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
              These are the only facts an agent may say. Your name, street, phone, email, account number, payment
              details and income are never said. You confirm before anything leaves this page.
            </p>
          </div>

          {plan.mode === 'allowlist' && plan.notice ? (
            <p className="rounded-card border border-deadline-edge bg-deadline-tint p-3 text-small text-ink">
              {plan.notice}
            </p>
          ) : null}

          <div className="rounded-card border border-rule bg-paper-sunk/50 p-4">
            <p className="text-small font-medium">The facts we would share</p>
            <dl className="mt-2 grid gap-1.5 text-small sm:grid-cols-2">
              {disclosureRows(facts, selectedKind === 'fuel' ? 'fuel' : 'installer').map((row) => (
                <div key={row.label} className="flex justify-between gap-4 border-b border-rule/70 pb-1.5">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="tabular-nums text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-micro text-ink-faint">
              Never said: {NEVER_SAID.join(' · ')}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="ZIP (optional)">
              <input
                value={zip}
                onChange={(event) => setZip(event.target.value.replace(/\D/g, '').slice(0, 5))}
                inputMode="numeric"
                placeholder="02474"
                className={INPUT}
              />
            </Labeled>
            {selectedKind === 'fuel' ? (
              <>
                <Labeled label="Delivery size, gallons">
                  <input
                    value={delivery}
                    onChange={(event) => setDelivery(event.target.value)}
                    inputMode="numeric"
                    className={INPUT}
                  />
                </Labeled>
                <Labeled label="Tank size, gallons (optional)">
                  <input
                    value={tank}
                    onChange={(event) => setTank(event.target.value)}
                    inputMode="numeric"
                    placeholder="275"
                    className={INPUT}
                  />
                </Labeled>
                <Labeled label="Delivery window (optional)">
                  <input
                    value={deliveryWindow}
                    onChange={(event) => setDeliveryWindow(event.target.value.slice(0, 40))}
                    placeholder="next two weeks"
                    className={INPUT}
                  />
                </Labeled>
              </>
            ) : null}
          </div>

          <div>
            <p className="text-small font-medium">Who we would contact</p>
            {contactable.length === 0 ? (
              <p className="mt-1 max-w-[64ch] rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-3 text-small text-ink-muted">
                {plan.reason ?? 'No provider list is configured.'}{' '}
                {selectedKind === 'fuel'
                  ? 'The switch kit below has the exact question to ask a dealer you choose.'
                  : 'The switch kit below has the exact question to ask a Mass Save contractor.'}
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {contactable.map((provider) => {
                  const checked = picked[provider.id] === true
                  const activeChannel = channel[provider.id] ?? provider.channels[0]
                  return (
                    <li key={provider.id} className="rounded-card border border-rule bg-paper-sunk/40 p-3">
                      <label className="flex items-start gap-2.5 text-small">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setPicked((current) => ({ ...current, [provider.id]: event.target.checked }))
                          }}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="font-medium text-ink">{provider.name}</span>
                          {provider.allowlist ? (
                            <span className="ml-2 rounded-pill border border-deadline-edge bg-deadline-tint px-2 py-0.5 text-micro text-ink">
                              Team test line
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-micro text-ink-faint">
                            {provider.phone ?? provider.email ?? 'no contact on file'} · {provider.source} ·{' '}
                            {provider.asOf}
                          </span>
                        </span>
                      </label>
                      {checked && provider.channels.length > 1 ? (
                        <div className="mt-2 flex gap-2 pl-7">
                          {provider.channels.map((option) => (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={activeChannel === option}
                              onClick={() => setChannel((current) => ({ ...current, [provider.id]: option }))}
                              className={`rounded-pill border px-3 py-1 text-micro ${
                                activeChannel === option
                                  ? 'border-ink bg-ink text-paper'
                                  : 'border-rule-strong text-ink-muted hover:border-ink hover:text-ink'
                              }`}
                            >
                              {option === 'email' ? 'Email' : 'Phone'}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-2 text-micro text-ink-faint">
              At most six providers per session. Calls go out Monday to Friday 8am–5pm and Saturday 8am–12pm Eastern;
              outside that window a call is scheduled, never placed. Consent lives in this tab and nowhere else.
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-card border border-deadline-edge bg-deadline-tint p-3 text-small text-ink">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            {contactable.length > 0 ? (
              <button
                type="button"
                onClick={contact}
                disabled={submitting || selectedProviders.length === 0}
                className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper disabled:opacity-40"
              >
                {submitting
                  ? 'Sending…'
                  : `Confirm and contact ${selectedProviders.length || ''} provider${selectedProviders.length === 1 ? '' : 's'}`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOutreachOverride({
                  ok: true,
                  mode: 'off',
                  notice: 'Nothing was sent. The switch kit below is yours to use.',
                  statuses: [],
                })
                persist('consented', null)
              }}
              className={
                contactable.length > 0
                  ? 'text-micro text-ink-muted underline'
                  : 'rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper'
              }
            >
              Show me the switch kit
            </button>
            <p className="text-micro text-ink-faint">
              {plan.mode === 'off'
                ? 'Outreach is off in this build, so nothing can be sent.'
                : 'You can still use the kit instead of contacting anyone.'}
            </p>
          </div>

          {outreach ? (
            <>
              <p className="rounded-card border border-rule bg-paper-sunk/60 p-3 text-small text-ink">
                {outreach.notice}
              </p>

              {outreach.statuses.length ? (
                <div>
                  <p className="text-small font-medium">Where each contact stands</p>
                  <ul className="mt-2 grid gap-1.5">
                    {outreach.statuses.map((status) => (
                      <StatusRow key={`${status.providerId}-${status.channel}`} status={status} />
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-card border border-rule bg-paper-sunk/40 p-4">
                <p className="text-small font-medium">Quotes</p>
                <p className="mt-1 text-small text-ink-muted">
                  Nothing came back yet. A quote is a reply or a call transcript, and this build does not invent one.
                  The switch kit below is how you get a real number now.
                </p>
              </div>

              <SwitchKit
                kind={selectedKind === 'fuel' ? 'fuel' : 'installer'}
                facts={facts}
                town={model.town}
                supply={kitSupply}
                contact={null}
              />

              <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                <button
                  type="button"
                  onClick={() => persist('decided', 'contacting')}
                  className="rounded-pill border border-ink px-4 py-2.5 text-small font-medium text-ink hover:bg-ink hover:text-paper"
                >
                  I&rsquo;ve asked for a quote
                </button>
                <button
                  type="button"
                  onClick={() => persist('decided', 'declined')}
                  className="text-micro text-ink-muted underline"
                >
                  Not now
                </button>
                <Link href="/dashboard" className="text-micro text-ink-muted underline">
                  See the dashboard
                </Link>
                {storedStage === 'decided' ? <span className="text-micro text-ink-faint">Saved in this tab.</span> : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ panels

function StayPanel({ model, onSave, saved }: { model: SwitchModel; onSave: () => void; saved: boolean }) {
  const result = model.result
  return (
    <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
      <div>
        <p className="text-eyebrow uppercase text-ink-muted">Stay · what would change the answer</p>
        <h2 className="mt-2 text-title font-medium">Nothing changes today. Here is the tripwire.</h2>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Break-even electricity"
          value={
            result?.breakEvenElectricPrice === null || result === null
              ? '—'
              : `${(result.breakEvenElectricPrice * 100).toFixed(1)}¢/kWh`
          }
          note="Above this, the heat pump costs money. Watch your rate."
        />
        <Stat
          label="Rebate at stake on 1 Jan"
          value={result ? `$${Math.round(result.cliffCost).toLocaleString('en-US')}` : '—'}
          note="The whole-home rebate steps down for installs on or after 2027-01-01."
        />
        <Stat
          label="Next supply reset"
          value="1 Feb 2027"
          note="Basic Service resets every six months; the comparison changes then."
        />
      </dl>

      <p className="text-small text-ink-muted">
        If your fuel price falls, the break-even rate moves. If your electricity rate falls under it, the answer
        flips. This build has no server account, so it cannot email you when that happens — the dashboard keeps the
        request for this tab only.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <button
          type="button"
          onClick={onSave}
          className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
        >
          Save this decision
        </button>
        <Link href="/dashboard" className="text-micro text-ink-muted underline">
          See the dashboard
        </Link>
        {saved ? <span className="text-micro text-ink-faint">Saved in this tab.</span> : null}
      </div>
    </section>
  )
}

function SupplyPanel({
  model,
  supplierCents,
  monthlyKwh,
  onSupplierCents,
  onMonthlyKwh,
  onRecord,
  saved,
}: {
  model: SwitchModel
  supplierCents: string
  monthlyKwh: string
  onSupplierCents: (value: string) => void
  onMonthlyKwh: (value: string) => void
  onRecord: () => void
  saved: boolean
}) {
  const basicCents = model.supply.basic?.centsPerKwh ?? null
  const kitSupply = {
    basicCents,
    basicSource: model.supply.basic
      ? `${model.supply.basic.source} · ${model.supply.basic.sourceDate}`
      : null,
    sponsorLabel: model.supply.sponsorLabel,
    aggregationUrl: model.supply.aggregationUrl,
    energySwitchUrl: model.supply.energySwitchUrl,
  }
  const supplier = Number(supplierCents)
  const kwh = Number(monthlyKwh)
  const difference =
    basicCents !== null && supplier > 0 && kwh > 0
      ? monthlyDifferenceUsd({ supplierRateCents: supplier, basicServiceCents: basicCents, kwh })
      : null

  return (
    <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
      <div>
        <p className="text-eyebrow uppercase text-ink-muted">Electricity supply · published</p>
        <h2 className="mt-2 text-title font-medium">Three ways to buy the same electrons.</h2>
        <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
          No call is placed here: supply rates are published. Delivery stays with{' '}
          {model.supply.sponsorLabel ?? 'your utility'} whatever you choose.
        </p>
      </div>

      <dl className="grid gap-2">
        <div className="rounded-card border border-rule bg-paper-sunk/40 p-3">
          <dt className="flex flex-wrap items-center gap-2 text-small font-medium">
            Basic Service
            {model.supply.basic ? (
              <FreshnessBadge kind="baked" date={model.supply.basic.sourceDate} label={model.supply.basic.source} />
            ) : null}
          </dt>
          <dd className="mt-1 text-small text-ink-muted">
            {basicCents === null
              ? 'No supply-only rate is published for this sponsor, so none is printed.'
              : `${basicCents.toFixed(1)}¢/kWh supply only, ${model.supply.basic?.period ?? ''}. The utility buys it for you; it resets every six months.`}
          </dd>
        </div>
        <div className="rounded-card border border-rule bg-paper-sunk/40 p-3">
          <dt className="text-small font-medium">Municipal aggregation</dt>
          <dd className="mt-1 text-small text-ink-muted">
            Your town may contract supply for residents, and there is no exit fee to opt out. This build never claims
            a town has or lacks a program —{' '}
            <a className="underline" href={model.supply.aggregationUrl} target="_blank" rel="noreferrer">
              the state list
            </a>{' '}
            is the source.
          </dd>
        </div>
        <div className="rounded-card border border-rule bg-paper-sunk/40 p-3">
          <dt className="text-small font-medium">Competitive supplier</dt>
          <dd className="mt-1 text-small text-ink-muted">
            Compare at{' '}
            <a className="underline" href={model.supply.energySwitchUrl} target="_blank" rel="noreferrer">
              Energy Switch Massachusetts
            </a>
            . Check the contract end, fixed or variable, auto-renewal, and the early termination fee.
          </dd>
        </div>
      </dl>

      <div className="rounded-card border border-rule bg-paper-sunk/50 p-4">
        <p className="text-small font-medium">Compare your own supply line</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Labeled label="Your supply rate, ¢/kWh">
            <input
              value={supplierCents}
              onChange={(event) => onSupplierCents(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 21.0"
              className={INPUT}
            />
          </Labeled>
          <Labeled label="Monthly use, kWh">
            <input
              value={monthlyKwh}
              onChange={(event) => onMonthlyKwh(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 600"
              className={INPUT}
            />
          </Labeled>
        </div>
        {difference ? (
          <p className="mt-3 text-small">
            <span className={difference.usd > 0 ? 'text-deadline' : 'text-switch'}>
              {difference.usd > 0
                ? `You pay ${difference.display} a month more than Basic Service`
                : `You pay ${difference.display} a month less than Basic Service`}
            </span>
            <span className="mt-1 block text-micro text-ink-muted">{difference.formula}</span>
          </p>
        ) : (
          <p className="mt-2 text-micro text-ink-faint">
            Two numbers and the formula appears with them substituted. Positive means you are paying more than Basic
            Service.
          </p>
        )}
      </div>

      <SwitchKit kind="supply" facts={null} town={model.town} supply={kitSupply} contact={null} />

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        <button
          type="button"
          onClick={onRecord}
          className="rounded-pill border border-ink px-4 py-2.5 text-small font-medium text-ink hover:bg-ink hover:text-paper"
        >
          I&rsquo;ve checked my supply
        </button>
        <Link href="/dashboard" className="text-micro text-ink-muted underline">
          See the dashboard
        </Link>
        {saved ? <span className="text-micro text-ink-faint">Saved in this tab.</span> : null}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ pieces

function OutcomeChip({ outcome }: { outcome: BestCaseOutcome }) {
  const meta = OUTCOME[outcome]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-micro font-medium ${meta.tone}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

function StatusRow({ status }: { status: ProviderStatus }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-card border border-rule bg-surface p-2.5 text-small">
      <span>
        <span className="font-medium">{status.name}</span>{' '}
        <span className="text-micro text-ink-faint">· {status.channel}</span>
        {status.note ? <span className="mt-0.5 block text-micro text-ink-muted">{status.note}</span> : null}
      </span>
      <span className={`rounded-pill border px-2 py-0.5 text-micro font-medium ${statusTone(status.status)}`}>
        {CONTACT_STATUS_LABEL[status.status]}
      </span>
    </li>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-rule bg-paper-sunk/40 p-4">
      <dt className="text-eyebrow uppercase text-ink-faint">{label}</dt>
      <dd className="mt-1 text-title font-medium tabular-nums">{value}</dd>
      <dd className="mt-1 text-micro text-ink-muted">{note}</dd>
    </div>
  )
}

const INPUT = 'rounded-card border border-rule-strong bg-surface px-3 py-2 tabular-nums'

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-small">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function clampDelivery(raw: string): number {
  const value = Number(raw.replace(/[,\s]/g, ''))
  if (!Number.isFinite(value)) return DEFAULT_DELIVERY_GALLONS
  return Math.min(1_000, Math.max(50, Math.round(value)))
}
