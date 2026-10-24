'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { ReminderButton } from '@/components/verdict/reminder-button'
import { withDemo } from '@/lib/demo'
import {
  profileSnapshot,
  readStoredProfile,
  serverProfileSnapshot,
  subscribeProfile,
  withoutProfile,
  writeProfile,
} from '@/lib/onboarding/flow'
import { defaultInstallYear } from '@/lib/intake/params'
import { readCompleted } from '@/lib/profile/completion'
import {
  CONTACT_STATUS_LABEL,
  readStoredSwitch,
  serverSwitchSnapshot,
  subscribeSwitch,
  switchSnapshot,
  writeSwitch,
} from '@/lib/switch/session'
import { choiceLabel, dashboardNext, dashboardSteps, decisionCopy, verdictLabel } from '@/lib/switch/dashboard'
import { daysUntil, nextBasicServiceReset, REBATE_STEP_DOWN } from '@/lib/supply'
import { verdictPath } from '@/lib/verdict/share-query'
import type { StoredSwitch } from '@/lib/switch/types'

/**
 * @built F-150 `/dashboard` — the household's one screen, across every state
 *
 * The tab owns one request and one profile. This screen answers three questions
 * in order: what is the next thing to do, what is the state of the agent run, and
 * what does this browser remember. Nothing here is fetched from a server, and no
 * number is recomputed: every figure is either the request the verdict produced
 * or the call the agent already made.
 */

const TONE: Record<string, string> = {
  switch: 'border-switch-edge bg-switch-tint',
  deadline: 'border-deadline-edge bg-deadline-tint',
  hold: 'border-hold-edge bg-hold-tint',
  plain: 'border-rule bg-surface',
}

export function DashboardView({ demo = false }: { demo?: boolean }) {
  const profileRaw = useSyncExternalStore(subscribeProfile, profileSnapshot, serverProfileSnapshot)
  const switchRaw = useSyncExternalStore(subscribeSwitch, switchSnapshot, serverSwitchSnapshot)
  const profile = readStoredProfile(profileRaw)
  const completed = readCompleted(profileRaw)
  const request = readStoredSwitch(switchRaw)
  const damagedProfile = profileRaw !== null && profile === null
  const damagedSwitch = switchRaw !== null && request === null

  const today = new Date()
  const daysLeft = daysUntil(REBATE_STEP_DOWN, today)
  const resetDate = nextBasicServiceReset(today)
  const firstName = profile?.name.trim().split(/\s+/)[0] ?? null

  const next = dashboardNext({
    request,
    profile: completed
      ? { town: completed.town, verdictHref: verdictHrefFor(completed) }
      : profile
        ? { town: null, verdictHref: null }
        : null,
    demo,
  })

  const steps = request ? dashboardSteps(request) : null
  const decision = request ? decisionCopy(request) : null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">Dashboard</p>
          <h1 className="mt-2 text-headline font-medium">
            {firstName ? `Hello, ${firstName}.` : 'Your home, in one place.'}
          </h1>
          <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
            One tab, one request. The profile and the agent run live in this browser; there is no account on a server
            to log in to, and nothing here is sent anywhere.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-micro">
          <Link
            href={withDemo(profile ? '/profile' : '/onboarding', demo)}
            className="text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {profile ? 'Your profile' : 'Create profile'}
          </Link>
        </div>
      </div>

      {damagedProfile || damagedSwitch ? (
        <section className="grid gap-3 rounded-card border border-deadline-edge bg-deadline-tint p-4 text-small">
          <p className="font-medium text-ink">This browser has a record we cannot read.</p>
          <p className="text-ink-muted">
            An older or damaged copy is stored here. Reading it would risk showing another house&rsquo;s numbers, so
            this screen ignores it. Clearing it is safe: the bills are not stored anywhere else.
          </p>
          <div className="flex flex-wrap gap-3">
            {damagedProfile ? (
              <button
                type="button"
                onClick={() => writeProfile(null)}
                className="rounded-pill border border-ink px-4 py-2 text-small font-medium text-ink"
              >
                Clear the unreadable profile
              </button>
            ) : null}
            {damagedSwitch ? (
              <button
                type="button"
                onClick={() => writeSwitch(null)}
                className="rounded-pill border border-ink px-4 py-2 text-small font-medium text-ink"
              >
                Clear the unreadable request
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        data-tone={next.tone === 'plain' ? undefined : next.tone}
        className={`rounded-card border p-5 sm:p-6 ${TONE[next.tone]}`}
      >
        <p className="text-eyebrow uppercase text-ink-muted">{next.eyebrow}</p>
        <h2 className="mt-2 max-w-[30ch] text-title font-medium">{next.title}</h2>
        <p className="mt-2 max-w-[62ch] text-small text-ink-muted">{next.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {next.action ? (
            <Link
              href={next.action.href}
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
            >
              {next.action.label}
            </Link>
          ) : null}
          {next.secondary ? (
            <Link
              href={next.secondary.href}
              className="text-small text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
            >
              {next.secondary.label}
            </Link>
          ) : null}
        </div>
      </section>

      {profile || request ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-card border border-rule bg-surface p-5">
            <h2 className="text-small font-medium">Your home</h2>
            {request?.facts || completed ? (
              <dl className="mt-3 grid gap-2 text-small">
                <Row term="Town" value={request?.facts?.town ?? completed?.town ?? '—'} />
                {request?.facts?.zip ? <Row term="ZIP" value={request.facts.zip} /> : null}
                <Row
                  term="Heating fuel"
                  value={fuelLabel(request?.facts?.fuel ?? completed?.fuel ?? null)}
                />
                <Row term="Annual use" value={annualUse(request, completed?.units ?? null, completed?.fuel ?? null)} />
                <Row
                  term="Electricity use"
                  value={completed?.kwh ? `${completed.kwh.toLocaleString('en-US')} kWh a month` : '—'}
                />
                <Row
                  term="Income limit"
                  value={
                    completed
                      ? completed.income === 'yes'
                        ? 'Under the limit'
                        : completed.income === 'no'
                          ? 'Not under the limit'
                          : 'Not sure'
                      : '—'
                  }
                />
              </dl>
            ) : (
              <p className="mt-2 max-w-[52ch] text-small text-ink-muted">
                No house numbers in this browser yet. A profile is a name and an email; the verdict needs a year of
                heating use and a price.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-3 text-micro">
              <Link href={withDemo('/onboarding', demo)} className="underline underline-offset-4">
                {request ? 'Update the bills' : 'Add your bills'}
              </Link>
              {request ? (
                <>
                  <Link href={withDemo(verdictPath(request.query), demo)} className="underline underline-offset-4">
                    The arithmetic
                  </Link>
                  {request.choice === 'SWITCH_HEAT_PUMP' || request.choice === 'SHOP_FUEL' ? (
                    <Link
                      href={withDemo(
                        `/switch?${request.query}`,
                        demo || new URLSearchParams(request.query).get('demo') === '1',
                      )}
                      className="underline underline-offset-4"
                    >
                      Change ZIP
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <section className="rounded-card border border-rule bg-surface p-5">
            <h2 className="text-small font-medium">The request</h2>
            {request ? (
              <>
                <dl className="mt-3 grid gap-2 text-small">
                  <Row term="You chose" value={choiceLabel(request)} />
                  <Row term="Verdict at the time" value={verdictLabel(request.verdict)} />
                  <Row
                    term="Recorded"
                    value={new Date(request.at).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  />
                </dl>

                {steps ? (
                  <ol className="mt-4 grid gap-2 border-t border-rule pt-3">
                    {steps.steps.map((step, index) => {
                      const done = index <= steps.current
                      const current = index === steps.current
                      return (
                        <li
                          key={step.stage}
                          aria-current={current ? 'step' : undefined}
                          className="flex items-start gap-2.5 text-small"
                        >
                          <span
                            aria-hidden
                            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-micro ${
                              done
                                ? 'border-switch-edge bg-switch-tint text-switch'
                                : 'border-rule-strong text-ink-faint'
                            }`}
                          >
                            {done ? '✓' : index + 1}
                          </span>
                          <span className={done ? 'text-ink' : 'text-ink-faint'}>
                            {step.label}
                            <span className="sr-only">{done ? ' — done' : ' — not reached'}</span>
                            {current ? <span className="ml-2 text-micro text-ink-muted">Now</span> : null}
                            <span className="mt-0.5 block text-micro text-ink-muted">{step.copy}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                ) : null}

                {request.stage === 'kit' ? (
                  <Link
                    href={withDemo(`/switch?${request.query}`, demo || new URLSearchParams(request.query).get('demo') === '1')}
                    className="mt-3 inline-block text-micro underline underline-offset-4"
                  >
                    Reopen the switch kit
                  </Link>
                ) : null}

                {decision && request.choice !== 'STAY' && request.choice !== 'SHOP_SUPPLY' ? (
                  <p className="mt-4 border-t border-rule pt-3 text-micro text-ink-muted">
                    {decision} Recorded {new Date(request.decision?.at ?? request.at).toLocaleString('en-US')}.
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3 text-micro">
                  <button
                    type="button"
                    onClick={() => writeSwitch(null)}
                    className="text-ink-muted underline underline-offset-4 hover:text-ink"
                  >
                    Forget this tab&rsquo;s request
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 max-w-[52ch] text-small text-ink-muted">
                No request yet. The verdict records one when you confirm something: a stay, a supply check, a kit, or
                an agent run.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {request ? <AgentCard request={request} action={next.action} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-card border border-deadline-edge bg-deadline-tint p-5">
          <p className="text-eyebrow uppercase text-ink-muted">The rebate</p>
          <p className="mt-2 text-title font-medium tabular-nums" suppressHydrationWarning>
            {Number.isFinite(daysLeft) && daysLeft >= 0 ? `${daysLeft} days left` : 'The 2026 rate has closed'}
          </p>
          <p className="mt-1 text-small text-ink-muted">
            {Number.isFinite(daysLeft) && daysLeft >= 0
              ? 'until the whole-home rebate step-down on 1 January 2027. Installs completed after it are paid at the 2027 rate.'
              : 'Installs completed now are paid at the 2027 rate. A new programme year may change the number again.'}
          </p>
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <p className="text-eyebrow uppercase text-ink-faint">Next supply reset</p>
          <p className="mt-2 text-title font-medium">{dateLabel(resetDate)}</p>
          <p className="mt-1 text-small text-ink-muted">
            Basic Service resets every six months. Any supply comparison on this device is dated and will change then.
          </p>
          <Link href={withDemo('/map', demo)} className="mt-3 inline-block text-micro text-ink-muted underline underline-offset-4">
            See how your town compares
          </Link>
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <p className="text-eyebrow uppercase text-ink-faint">The re-check</p>
          {request ? (
            <>
              <p className="mt-2 text-small text-ink">
                {request.verdict === 'DO_NOT_SWITCH_YET' || request.choice === 'STAY'
                  ? 'Nothing needs calling today. A calendar entry for early January puts the decision back on the table.'
                  : 'The rebate date and the next supply reset are the two dates that move this answer.'}
              </p>
              <ReminderButton
                label="Add a January reminder"
                path={withDemo(verdictPath(request.query), demo)}
                className="mt-3 rounded-pill border border-ink px-4 py-2 text-small font-medium text-ink hover:bg-ink hover:text-paper"
              />
            </>
          ) : completed && verdictHrefFor(completed) ? (
            <>
              <p className="mt-2 text-small text-ink">
                Your verdict is still here. Put early January in your calendar, when prices and the rebate reset.
              </p>
              <ReminderButton
                label="Add a January reminder"
                path={withDemo(verdictHrefFor(completed) as string, demo)}
                className="mt-3 rounded-pill border border-ink px-4 py-2 text-small font-medium text-ink hover:bg-ink hover:text-paper"
              />
            </>
          ) : (
            <p className="mt-2 text-small text-ink-muted">
              When the verdict says switch, the agent can call installers from here with only the facts you approve.
              Add your bills first, and this card becomes the re-check and the reminder.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-card border border-rule bg-surface p-5">
        <h2 className="text-small font-medium">Your profile</h2>
        {profile ? (
          <>
            <dl className="mt-3 grid gap-2 text-small">
              <Row term="Name" value={profile.name} />
              <Row term="Email" value={profile.email} />
              <Row term="Phone" value={profile.phone ? formatPhone(profile.phone) : 'not given'} />
              <Row term="Consent recorded" value={new Date(profile.consentAt).toLocaleDateString('en-US')} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-3 text-micro">
              <Link href={withDemo('/profile', demo)} className="underline underline-offset-4">
                Edit it
              </Link>
              <button
                type="button"
                onClick={() => writeProfile(withoutProfile(profileRaw))}
                className="text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Forget my profile
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-small text-ink-muted">
            No profile in this browser.{' '}
            <Link href={withDemo('/onboarding', demo)} className="underline">
              Create one
            </Link>{' '}
            to get started.
          </p>
        )}
      </section>

      <p className="max-w-[70ch] text-micro text-ink-faint">
        Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.
      </p>
    </div>
  )
}

function AgentCard({
  request,
  action,
}: {
  request: StoredSwitch
  action: { label: string; href: string } | null
}) {
  const run = request.agent
  const quotes = request.quotes
  const isSwitchVerdict = request.verdict === 'SWITCH_NOW' || request.verdict === 'SWITCH_BEFORE_DEC31'
  const canStart = isSwitchVerdict && (request.choice === 'SWITCH_HEAT_PUMP' || request.choice === 'SHOP_FUEL')
  if (!run && !quotes && !canStart) return null

  const noun = (request.choice === 'SHOP_FUEL' || run?.kind === 'fuel' || quotes?.kind === 'fuel') ? 'dealer' : 'installer'
  const finished =
    Boolean(run) &&
    (request.stage === 'quotes_ready' ||
      request.stage === 'decided' ||
      request.stage === 'introduced' ||
      request.stage === 'switched')
  const title = quotes
    ? 'What the agent brought back'
    : finished
      ? 'The agent came back without a price'
      : run
        ? 'The agent is on it'
        : 'The agent can do the calling'

  return (
    <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">The agent</p>
          <h2 className="mt-2 text-title font-medium">{title}</h2>
        </div>
        {action ? (
          <Link
            href={action.href}
            className="rounded-pill border border-ink px-4 py-2 text-small font-medium text-ink hover:bg-ink hover:text-paper"
          >
            {action.label}
          </Link>
        ) : null}
      </div>

      {run?.mode === 'demo' || (quotes && !run) ? (
        <p className="rounded-card border border-deadline-edge bg-deadline-tint p-3 text-small text-ink">
          Demo mode: the conversations are replayed from a fixture, in the same order every run. Nothing was dialled,
          emailed or sent.
        </p>
      ) : null}

      {run ? (
        <p className="max-w-[62ch] text-small text-ink-muted">
          You approved the facts and the providers.{' '}
          {finished
            ? `The agent finished with ${run.providerIds.length} ${noun}${run.providerIds.length === 1 ? '' : 's'}.`
            : `The agent is contacting ${run.providerIds.length} ${noun}${run.providerIds.length === 1 ? '' : 's'}.`}{' '}
          It said only what you read on the consent screen.
          {!quotes && finished
            ? ' No usable price came back; the switch kit still has the exact question to ask.'
            : ''}
        </p>
      ) : canStart ? (
        <p className="max-w-[62ch] text-small text-ink-muted">
          You have not sent anything yet. The agent can contact the first two {noun}s for this town with only the
          facts you have already seen: town, fuel, yearly use and the equipment size. No name, street, phone, email or
          income.
        </p>
      ) : null}

      {request.statuses.length ? (
        <ul className="grid gap-1.5">
          {request.statuses.map((status) => (
            <li
              key={`${status.providerId}-${status.channel}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-card border border-rule/70 bg-paper-sunk/30 px-3 py-2 text-small"
            >
              <span>
                <span className="font-medium text-ink">{status.name}</span>{' '}
                <span className="text-micro text-ink-faint">· {status.channel === 'phone' ? 'Phone' : 'Email'}</span>
                {status.allowlist ? (
                  <span className="ml-2 rounded-pill border border-deadline-edge bg-deadline-tint px-2 py-0.5 text-micro text-ink">
                    Team test line
                  </span>
                ) : null}
                {status.note ? <span className="mt-0.5 block text-micro text-ink-muted">{status.note}</span> : null}
              </span>
              <span className="text-micro text-ink-muted">
                {CONTACT_STATUS_LABEL[status.status] ?? status.status}
                <span className="ml-2 text-ink-faint">{timeLabel(status.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {quotes ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-[1.4fr_1fr_0.9fr] gap-2 border-b border-rule pb-1 text-micro uppercase text-ink-faint">
            <span>{quotes.kind === 'fuel' ? 'Dealer' : 'Installer'}</span>
            <span>{quotes.kind === 'fuel' ? 'A year at your use' : 'Ballpark total'}</span>
            <span>{quotes.kind === 'fuel' ? '$/gal effective' : '$/ton'}</span>
          </div>
          {quotes.rows.map((row) => (
            <div
              key={row.providerId}
              className={`grid grid-cols-[1.4fr_1fr_0.9fr] items-baseline gap-2 rounded-card border px-3 py-2 text-small ${
                quotes.best?.providerId === row.providerId
                  ? 'border-moss-edge bg-moss-tint'
                  : 'border-rule/70 bg-paper-sunk/20'
              }`}
            >
              <span className="font-medium text-ink">
                {row.providerName}
                {row.status !== 'ranked' ? (
                  <span className="ml-2 rounded-pill border border-rule-strong px-2 py-0.5 text-micro text-ink-muted">
                    Shown, not ranked
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums text-ink">{money(row.figure, 0)}</span>
              <span className="tabular-nums text-ink">{row.unit === null ? '—' : row.kind === 'fuel' ? `$${row.unit.toFixed(2)}` : money(row.unit, 0)}</span>
              {row.note ? <span className="col-span-3 text-micro text-ink-faint">{row.note}</span> : null}
            </div>
          ))}
          {quotes.best ? (
            <p className="text-small text-ink">
              <span className="font-medium">{quotes.best.providerName}</span> has the best comparable number
              {quotes.best.figure !== null ? `: ${money(quotes.best.figure)}` : ''}. Every figure is computed from what
              was said on the call, not from a model.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-rule/70 pb-1.5">
      <dt className="shrink-0 text-ink-muted">{term}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{value}</dd>
    </div>
  )
}

const FUEL_LABEL: Record<string, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

function fuelLabel(fuel: string | null): string {
  return fuel ? (FUEL_LABEL[fuel] ?? 'not recorded') : 'not recorded'
}

function annualUse(request: StoredSwitch | null, profileUnits: number | null, profileFuel: string | null): string {
  const volume = request?.facts?.annualVolume ?? profileUnits
  const unit =
    request?.facts?.unit ??
    (profileFuel === 'gas' ? 'therms' : profileFuel === 'resistance' ? 'kWh' : profileFuel ? 'gal' : null)
  if (volume === null || volume === undefined) return '—'
  if (unit === 'gal') return `${volume.toLocaleString('en-US')} gallons a year`
  if (unit === 'therms') return `${volume.toLocaleString('en-US')} therms a year`
  if (unit === 'kWh') return `${volume.toLocaleString('en-US')} kWh a year`
  return volume.toLocaleString('en-US')
}

function verdictHrefFor(completed: NonNullable<ReturnType<typeof readCompleted>>): string | null {
  // Kept local to avoid pulling the completion module's link builder into every
  // render; `readCompleted` already carries the stored heating numbers.
  const units = completed.units
  const price = completed.price
  if (units === null || price === null) return null
  return `/verdict?${new URLSearchParams({
    fuel: completed.fuel,
    units: String(units),
    price: String(price),
    town: completed.town,
    tier: 'whole',
    year: defaultInstallYear(),
    inc: completed.income,
  }).toString()}`
}

function dateLabel(iso: string): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

function timeLabel(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function money(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw
}
