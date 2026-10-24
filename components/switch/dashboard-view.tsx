'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { FreshnessBadge } from '@/components/freshness-badge'
import {
  profileSnapshot,
  readStoredProfile,
  serverProfileSnapshot,
  subscribeProfile,
  writeProfile,
} from '@/lib/onboarding/flow'
import {
  CONTACT_STATUS_LABEL,
  STAGE_COPY,
  readStoredSwitch,
  serverSwitchSnapshot,
  stageRank,
  subscribeSwitch,
  switchSnapshot,
  writeSwitch,
} from '@/lib/switch/session'
import type { SwitchStage } from '@/lib/switch/types'
import { daysUntil } from '@/lib/supply'

/**
 * @built F-150 `/dashboard` — Addendum B step 6's status, without a server account
 *
 * Everything here is read from this browser: the profile from local storage and the
 * switch request from session storage. That is the honest version of "your account"
 * in a build with no database — the screen says where it lives and forgets it on
 * request. No server round-trip, no analytics, no cookie.
 *
 * The timeline is the requirement's own: consented → contacting → quotes ready →
 * decided → introduced / switched. A request that stopped at "consented" says so
 * rather than pretending a call happened.
 */

const STAGES: readonly SwitchStage[] = ['consented', 'contacting', 'quotes_ready', 'decided', 'introduced', 'switched']

export function DashboardView() {
  const profileRaw = useSyncExternalStore(subscribeProfile, profileSnapshot, serverProfileSnapshot)
  const switchRaw = useSyncExternalStore(subscribeSwitch, switchSnapshot, serverSwitchSnapshot)
  const profile = readStoredProfile(profileRaw)
  const request = readStoredSwitch(switchRaw)

  const daysLeft = daysUntil('2026-12-31', new Date())
  const firstName = profile?.name.trim().split(/\s+/)[0] ?? null
  const reached = request ? stageRank(request.stage) : -1

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">Dashboard</p>
          <h1 className="mt-2 text-headline font-medium">
            {firstName ? `Hello, ${firstName}.` : 'Your home, in one place.'}
          </h1>
          <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
            Everything here lives in this browser: a profile on this device and a switch request for this tab. There
            is no account on a server to log in to, and nothing here is sent anywhere.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-micro">
          <FreshnessBadge kind="manual" label="This browser" />
          <Link href="/onboarding" className="text-ink-muted underline underline-offset-4 hover:text-ink">
            {profile ? 'Edit profile' : 'Create profile'}
          </Link>
        </div>
      </div>

      {!profile && !request ? (
        <section className="rounded-card border border-rule bg-surface p-6">
          <h2 className="text-title font-medium">Nothing here yet.</h2>
          <p className="mt-2 max-w-[58ch] text-small text-ink-muted">
            A profile keeps a name to greet you and an email on this device. The anonymous route needs neither.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/onboarding"
              className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
            >
              Create a profile
            </Link>
            <Link
              href="/start"
              className="rounded-pill border border-rule-strong px-5 py-2.5 text-small text-ink-muted hover:border-ink hover:text-ink"
            >
              Try it without an account
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-rule bg-surface p-5">
          <h2 className="text-small font-medium">Now</h2>
          {request ? (
            <>
              <dl className="mt-3 grid gap-2 text-small">
                <Row term="Town" value={request.facts?.town ?? '—'} />
                <Row
                  term="Heating fuel"
                  value={request.facts?.fuel ? FUEL_LABEL[request.facts.fuel] : '—'}
                />
                <Row
                  term="Annual use"
                  value={
                    request.facts?.annualVolume !== null && request.facts?.annualVolume !== undefined
                      ? `${request.facts.annualVolume.toLocaleString('en-US')} ${request.facts.unit ?? ''}`
                      : '—'
                  }
                />
                <Row term="Verdict at the time" value={request.verdict.replaceAll('_', ' ').toLowerCase()} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-3 text-micro">
                <Link href={`/verdict?${request.query}`} className="underline underline-offset-4">
                  The arithmetic
                </Link>
                <Link href={`/switch?${request.query}`} className="underline underline-offset-4">
                  Reopen the choice
                </Link>
              </div>
            </>
          ) : profile ? (
            <p className="mt-2 max-w-[52ch] text-small text-ink-muted">
              No numbers yet. The profile is a name and an email; the house needs a bill or two numbers.
            </p>
          ) : null}

          {!request && profile ? (
            <Link
              href="/start"
              className="mt-4 inline-block rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
            >
              Enter a bill
            </Link>
          ) : null}
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <h2 className="text-small font-medium">Switch status</h2>
          {request ? (
            <>
              <ol className="mt-3 grid gap-2">
                {STAGES.map((stage, index) => {
                  const done = reached >= index
                  return (
                    <li key={stage} className="flex items-start gap-2.5 text-small">
                      <span
                        aria-hidden
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-micro ${
                          done ? 'border-switch-edge bg-switch-tint text-switch' : 'border-rule-strong text-ink-faint'
                        }`}
                      >
                        {done ? '✓' : index + 1}
                      </span>
                      <span className={done ? 'text-ink' : 'text-ink-faint'}>
                        {STAGE_COPY[stage]}
                        {stage === request.stage ? <span className="ml-2 text-micro text-ink-muted">Now</span> : null}
                      </span>
                    </li>
                  )
                })}
              </ol>

              {request.statuses.length ? (
                <ul className="mt-4 grid gap-1.5 border-t border-rule pt-3">
                  {request.statuses.map((status) => (
                    <li
                      key={`${status.providerId}-${status.channel}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-micro"
                    >
                      <span className="text-ink">
                        {status.name} <span className="text-ink-faint">· {status.channel}</span>
                      </span>
                      <span className="text-ink-muted">{CONTACT_STATUS_LABEL[status.status]}</span>
                    </li>
                  ))}
                </ul>
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
              No switch request yet. The switch screen records one only when you confirm something — a choice, a
              provider list, or a kit you decided to use.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-card border border-deadline-edge bg-deadline-tint p-5">
          <p className="text-eyebrow uppercase text-ink-muted">Deadline</p>
          <p className="mt-2 text-title font-medium tabular-nums">
            {Number.isFinite(daysLeft) ? `${Math.max(0, daysLeft)} days` : '1 Jan 2027'}
          </p>
          <p className="mt-1 text-small text-ink-muted">
            until the whole-home rebate step-down on 1 January 2027. Installs completed after it are paid at the 2027
            rate.
          </p>
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <p className="text-eyebrow uppercase text-ink-faint">Next supply reset</p>
          <p className="mt-2 text-title font-medium">1 Feb 2027</p>
          <p className="mt-1 text-small text-ink-muted">
            Basic Service resets every six months. Any supply comparison on this device is dated and will change then.
          </p>
          <Link href="/map" className="mt-3 inline-block text-micro text-ink-muted underline underline-offset-4">
            Open the map
          </Link>
        </section>

        <section className="rounded-card border border-rule bg-surface p-5">
          <p className="text-eyebrow uppercase text-ink-faint">Notifications</p>
          <p className="mt-2 text-small text-ink">
            Not in this build. Alerts need an account on a server, and this build keeps everything in the browser, so
            there is nothing honest to promise here.
          </p>
          <p className="mt-2 text-micro text-ink-faint">
            The tripwires are printed instead: the break-even electricity price and the January delta.
          </p>
        </section>
      </div>

      {request?.decision ? (
        <p className="rounded-card border border-rule bg-paper-sunk/60 p-4 text-small text-ink-muted">
          Last decision:{' '}
          {request.decision.outcome === 'declined'
            ? 'you chose not to proceed.'
            : 'you are contacting a provider yourself.'}{' '}
          Recorded {new Date(request.decision.at).toLocaleString('en-US')}.
        </p>
      ) : null}

      <section className="rounded-card border border-rule bg-surface p-5">
        <h2 className="text-small font-medium">Your profile</h2>
        {profile ? (
          <>
            <dl className="mt-3 grid gap-2 text-small">
              <Row term="Name" value={profile.name} />
              <Row term="Email" value={profile.email} />
              <Row term="Phone" value={profile.phone || 'not given'} />
              <Row term="Consent recorded" value={new Date(profile.consentAt).toLocaleDateString('en-US')} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-3 text-micro">
              <Link href="/onboarding" className="underline underline-offset-4">
                Edit it
              </Link>
              <button
                type="button"
                onClick={() => writeProfile(null)}
                className="text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Forget my profile
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-small text-ink-muted">
            No profile in this browser. <Link href="/onboarding" className="underline">Create one</Link> or use{' '}
            <Link href="/start" className="underline">the anonymous route</Link>.
          </p>
        )}
      </section>

      <p className="max-w-[70ch] text-micro text-ink-faint">
        Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.
      </p>
    </div>
  )
}

const FUEL_LABEL: Record<string, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-rule/70 pb-1.5">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  )
}
