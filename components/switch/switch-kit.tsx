'use client'

import { useState } from 'react'

import { formatCents } from '@/lib/supply'
import { kitPlan } from '@/lib/switch/kit-steps'
import { fuelPhoneScript, installerPhoneScript, supplyKitScript } from '@/lib/switch/requests'
import type { SharedFacts } from '@/lib/switch/types'

/**
 * @built F-148 the switch kit — R20.8, the manual path that always works
 * @built F-166 the numbered plan, written for whichever path this deployment can take
 *
 * Everything here is text the household can use without this app: who to contact,
 * the exact sentence, what to have ready, and the label that stops a phone number
 * being mistaken for a contract. Phone numbers are only shown when a sourced
 * provider row carries one; this build does not invent a dealer or installer line.
 *
 * `mode` is the dial plan, not a display preference: with an agent configured the
 * steps describe what the agent does; without one they describe the calls the
 * household makes themselves. The plan comes from `lib/switch/kit-steps.ts`, so the
 * screen cannot promise a call this deployment cannot place.
 */

export interface SwitchKitSupply {
  basicCents: number | null
  basicSource: string | null
  sponsorLabel: string | null
  aggregationUrl: string
  energySwitchUrl: string
}

export interface SwitchKitContact {
  name: string
  phone: string | null
  source: string
  asOf: string
}

export interface SwitchKitProps {
  kind: 'fuel' | 'supply' | 'installer'
  facts: SharedFacts | null
  town: string
  supply: SwitchKitSupply
  /** A sourced provider line, when the deployment has one. */
  contact: SwitchKitContact | null
  /** The dial plan from `lib/calls/plan.ts`. Absent means off: no agent can call. */
  mode?: 'off' | 'allowlist' | 'live' | 'demo'
  /** Every row this deployment may contact, so the plan can print the numbers it has. */
  providers?: readonly SwitchKitContact[]
}

export function SwitchKit({ kind, facts, town, supply, contact, mode = 'off', providers = [] }: SwitchKitProps) {
  const script =
    kind === 'supply'
      ? supplyKitScript(town)
      : kind === 'installer'
        ? facts
          ? installerPhoneScript(facts)
          : null
        : facts
          ? fuelPhoneScript(facts)
          : null

  const rows = contact ? [contact, ...providers.filter((provider) => provider.name !== contact.name)] : providers
  const plan = kitPlan({
    kind,
    town,
    facts,
    mode,
    providers: rows.map((row) => ({ name: row.name, phone: row.phone, allowlist: row.source.toLowerCase().includes('allowlist') })),
  })

  return (
    <section className="rounded-card border border-rule bg-paper-sunk/50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-eyebrow uppercase text-ink-muted">The switch kit</p>
        <p className="text-micro text-ink-faint">
          {plan.path === 'agent' ? 'The agent can place these calls' : 'You place these calls'}
        </p>
      </div>
      <h3 className="mt-2 text-title font-medium">{plan.heading}</h3>
      <p className="mt-2 max-w-[62ch] text-small text-ink-muted">{plan.lede}</p>

      <ol className="mt-4 grid gap-2.5">
        {plan.steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-rule-strong text-micro tabular-nums text-ink-muted"
            >
              {index + 1}
            </span>
            <span className="text-small">
              <span className="font-medium text-ink">{step.title}</span>
              <span className="mt-0.5 block text-ink-muted">{step.copy}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-4 border-t border-rule pt-4">
        <div>
          <p className="text-small font-medium">Who to contact</p>
          {contact ? (
            <p className="mt-1 text-small text-ink-muted">
              {contact.name}
              {contact.phone ? ` · ${contact.phone}` : ''} · Source: {contact.source} · {contact.asOf}
            </p>
          ) : kind === 'installer' ? (
            <p className="mt-1 text-small text-ink-muted">
              A contractor in the Mass Save Heat Pump Installer Network — the network list is on{' '}
              <External href="https://www.masssave.com/">masssave.com</External>. Pick two and ask the same questions.
            </p>
          ) : kind === 'supply' ? (
            <p className="mt-1 text-small text-ink-muted">
              Your town&rsquo;s aggregation program (check the state list) or a supplier you choose at Energy Switch
              Massachusetts. Delivery stays with {supply.sponsorLabel ?? 'your utility'} either way.
            </p>
          ) : (
            <p className="mt-1 text-small text-ink-muted">
              Your current dealer first, then one or two others that deliver in {town}. No dealer list is configured
              in this build, so no phone number is printed here rather than an invented one.
            </p>
          )}
        </div>

        {script ? (
          <div>
            <p className="text-small font-medium">Say this</p>
            <div className="mt-1 rounded-card border border-rule bg-surface p-3">
              <p className="text-small text-ink">{script}</p>
              <CopyButton text={script} />
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-small font-medium">Have ready</p>
          <ul className="mt-1 grid list-disc gap-1 pl-5 text-small text-ink-muted">
            {kind === 'supply' ? (
              <>
                <li>Your current bill&rsquo;s supplier line and rate (¢/kWh), and the contract end date if there is one.</li>
                <li>Twelve months of kWh, so a rate can be turned into dollars.</li>
                <li>The supplier&rsquo;s written terms: fixed or variable, auto-renewal, and the early termination fee.</li>
              </>
            ) : kind === 'installer' ? (
              <>
                <li>Year built, heated square footage, and the fuel you heat with today.</li>
                <li>A year of fuel use and a year of electricity use, if you have the bills.</li>
                <li>The install target: 31 December 2026 is the rebate deadline.</li>
                <li>The Home Energy Assessment report, if one has been done.</li>
              </>
            ) : (
              <>
                <li>Your tank size and how much you usually take in one delivery.</li>
                <li>The price you paid last time, and whether you paid by card.</li>
                <li>The delivery address — the provider will ask for it, and only you should give it.</li>
              </>
            )}
          </ul>
        </div>

        {kind === 'supply' ? (
          <div className="grid gap-2 border-t border-rule pt-3 text-small">
            {supply.basicCents !== null ? (
              <p className="text-ink-muted">
                Basic Service, supply only: <span className="tabular-nums text-ink">{formatCents(supply.basicCents)}¢/kWh</span>
                {supply.basicSource ? ` · ${supply.basicSource}` : ''}. Never compare it with an all-in ¢/kWh.
              </p>
            ) : (
              <p className="text-ink-muted">No Basic Service number is published for this sponsor, so none is printed.</p>
            )}
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <External href={supply.aggregationUrl}>Municipal aggregation list (mass.gov)</External>
              <External href={supply.energySwitchUrl}>Energy Switch Massachusetts</External>
            </p>
            <p className="text-micro text-ink-faint">
              This comparison changes at the next supply reset. Do not treat today&rsquo;s rate as fixed.
            </p>
          </div>
        ) : null}

        <p className="border-t border-rule pt-3 text-micro text-ink-muted">
          {plan.closing} Ranking cannot be bought: no referral fees, no paid placement, no lead sales. And if a provider
          offers to call you back, tell them the homeowner will contact them — this build never hands over your name,
          phone or email.
        </p>
      </div>
    </section>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.replace(/[“”]/g, ''))
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }}
      className="mt-2 text-micro text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink"
    >
      {copied ? 'Copied' : 'Copy the sentence'}
    </button>
  )
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
    >
      {children}
    </a>
  )
}
