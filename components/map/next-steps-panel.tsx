'use client'

/**
 * Next steps tab: what the verdict means for one town, in that town's numbers.
 *
 * Every figure is read from a dated source or computed in lib/ from one. The quote
 * draft is built from the profile and the query only, and nothing leaves the browser
 * unless the user sends it from their own mail app. Consent lives in component state.
 */

import { useState, type ReactNode } from 'react'
import hp2026 from '@/data/rules/heat-pump-2026.json'
import hp2027 from '@/data/rules/heat-pump-2027.json'
import type { SponsorKey } from '@/lib/elec-label'
import {
  ASSESSMENT_PHONE,
  FEDERAL_25C_ENDED,
  HEAT_LOAN_MAX_USD,
  MASS_SAVE_READ,
  SEASONAL_MONTHS,
  massSaveGate,
  rateSponsorFor,
  seasonalRate,
  winterSavings,
} from '@/lib/mass-save'
import { formatMW, type EnergyMeta, type EnergyTown } from '@/lib/map/energy-model'
import { switchHref, verdictFacts, type NextStepsQuery, type VerdictBillUtility, type VerdictFuel } from '@/lib/map/next-steps-query'
import { CHOICE_COPY, choicesFor } from '@/lib/switch/choices'
import type { SwitchChoice } from '@/lib/switch/types'
import { buildQuoteRequest } from '@/lib/quote-request'
import { basicServiceRate, daysUntil, type BasicServiceRate } from '@/lib/supply'
import { SPONSOR_NAME, UTILITY_META, resolveUtility } from '@/lib/utility'
import type { HeatingFuel, Profile } from './types'

export interface NextStepsPanelProps {
  /** Selected town, display name. */
  town: string | null
  energy: EnergyTown | null
  meta: EnergyMeta | null
  profile: Profile
  query: Pick<NextStepsQuery, 'fuel' | 'saveUsd' | 'back'>
  onEditProfile: () => void
  today?: Date
}

const usd = (n: number) => `$${Math.abs(n).toLocaleString('en-US')}`
const plural = (n: number) => (n === 1 ? '' : 's')
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
const cents = (n: number) => `${n}¢`

const SPONSOR_OF_BILL: Record<VerdictBillUtility, SponsorKey> = {
  eversource: 'eversource',
  national_grid: 'nationalgrid',
  unitil: 'unitil',
  municipal: 'municipal',
}
const BILL_OF_SPONSOR: Partial<Record<SponsorKey, VerdictBillUtility>> = {
  eversource: 'eversource',
  nationalgrid: 'national_grid',
  unitil: 'unitil',
  municipal: 'municipal',
}
const asVerdictFuel = (fuel: HeatingFuel | null): VerdictFuel | null => (fuel === 'heat_pump' || fuel === null ? null : fuel)

function Src({ children }: { children: ReactNode }) {
  return <span className="text-micro text-ink-muted">{children}</span>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-small font-medium text-ink">{title}</h3>
      {children}
    </section>
  )
}

const P = ({ children }: { children: ReactNode }) => <p className="text-small text-ink">{children}</p>

export function NextStepsPanel({ town, energy, meta, profile, query, onEditProfile, today }: NextStepsPanelProps) {
  const now = today ?? new Date()
  if (!town) {
    return (
      <div className="flex flex-col gap-5">
        {query.saveUsd !== null ? <Verdict saveUsd={query.saveUsd} back={query.back} /> : null}
        <Section title="Pick your town">
          <P>Next steps use your town&apos;s utility and programs. Search for your town, ZIP or address, or click your town on the map.</P>
          <button
            type="button"
            onClick={() => document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus()}
            className="self-start rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus"
          >
            Search for your town
          </button>
        </Section>
      </div>
    )
  }
  const res = resolveUtility(town)
  if (!res.found) return <p className="text-small text-ink">{res.question}</p>

  const profileTown = profile.town === '' ? null : resolveUtility(profile.town)
  const isHome = profileTown !== null && profileTown.town === res.town
  const personal = isHome || profile.town === '' ? profile : null
  const fuel: HeatingFuel | null = query.fuel ?? personal?.fuel ?? null
  let sponsor: SponsorKey | null
  if (res.mixed) sponsor = personal?.utility && res.sponsors.includes(personal.utility) ? personal.utility : null
  else sponsor = res.sponsors[0] ?? null
  const gate = massSaveGate(sponsor)
  const municipal = sponsor === 'municipal'
  const monthlyKwh = personal && !personal.kwhIsExample && personal.kwh > 0 ? personal.kwh : null

  const facts = verdictFacts(query.back)
  const choiceFuel = query.back ? facts.fuel : asVerdictFuel(query.fuel ?? personal?.fuel ?? null)
  const billUtility = query.back ? facts.billUtility : ((personal?.utility && BILL_OF_SPONSOR[personal.utility]) || null)
  const choices = choicesFor({ verdict: null, fuel: choiceFuel, utility: res, billUtility })
  const supplySponsor = billUtility ? SPONSOR_OF_BILL[billUtility] : sponsor
  const basic = supplySponsor ? basicServiceRate(rateSponsorFor(supplySponsor, res.sponsors)) : null

  return (
    <div className="flex flex-col gap-5">
      {query.saveUsd !== null ? <Verdict saveUsd={query.saveUsd} back={query.back} /> : null}

      <Options
        choices={choices}
        href={switchHref(query.back)}
        why={{
          STAY: stayWhy(query.saveUsd),
          SHOP_FUEL: facts.unitPrice !== null && choiceFuel !== null ? `You entered ${usdPrice(facts.unitPrice)} a gallon. A dealer price comes from a call, so we draft the ask.` : null,
          SHOP_SUPPLY: supplyWhy(basic, supplySponsor, personal?.supplierRateCents ?? null),
          SWITCH_HEAT_PUMP: gate === false ? 'Mass Save rebates do not apply in your town.' : heatPumpWhy(facts.tier, now),
        }}
      />

      <Section title={`Your town: ${res.town}`}>
        <P>
          {sponsor
            ? `${SPONSOR_NAME[sponsor]} delivers your power.`
            : `${res.sponsors.map((s) => SPONSOR_NAME[s]).join(' and ')} serve ${res.town}. Which one bills you depends on your address.`}{' '}
          <Src>{`MassGIS · Electricity Providers · fetched ${UTILITY_META.fetchedAt.slice(0, 10)}`}</Src>
        </P>
        {sponsor === null ? (
          <button
            type="button"
            onClick={onEditProfile}
            className="self-start rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus"
          >
            Pick yours in My home
          </button>
        ) : null}
        {energy && meta ? (
          <P>
            {formatMW(energy.solarMW)} of solar installed across {energy.solarSystems.toLocaleString('en-US')} systems.{' '}
            <Src>{`${meta.sources.solar.label} · ${monthYear(meta.sources.solar.asOf)}`}</Src>
          </P>
        ) : null}
        <Incentives energy={energy} meta={meta} town={res.town} />
        {municipal ? (
          <P>
            Your town&apos;s light plant supplies and delivers your power, so Mass Save electric rebates don&apos;t apply. Ask the light
            plant what it offers; we have no program details on file for it. <Src>{MASS_SAVE_READ}</Src>
          </P>
        ) : null}
      </Section>

      <Section title="What the programs mean for your bill">
        <SeasonalRate sponsor={sponsor} townSponsors={res.sponsors} town={res.town} monthlyKwh={monthlyKwh} />
        {gate === false ? (
          <P>Mass Save rebates and the 0% HEAT Loan need a Mass Save sponsor. Check with Mass Save about your options.</P>
        ) : (
          <>
            <Rebate gate={gate} fuel={fuel} now={now} />
            <Enhanced gate={gate} fuel={fuel} income={personal?.incomeEligible ?? null} />
            <P>
              0% HEAT Loan up to {usd(HEAT_LOAN_MAX_USD)}. It&apos;s a loan, not a rebate. Federal 25C credit: expired {FEDERAL_25C_ENDED}.{' '}
              <Src>{MASS_SAVE_READ}</Src>
            </P>
          </>
        )}
      </Section>

      <Section title="Get a quote">
        <QuoteBlock
          key={res.town}
          facts={{ town: res.town, fuel, home: personal?.home ?? null, utility: sponsor ? SPONSOR_NAME[sponsor] : null, monthlyKwh }}
          showAssessment={gate !== false}
        />
      </Section>

      <p className="text-micro text-ink-muted">Estimates only. Not a quote. A Home Energy Assessment determines eligibility and sizing.</p>
    </div>
  )
}

const usdPrice = (n: number) => `$${n.toFixed(2)}`

function stayWhy(saveUsd: number | null): string | null {
  if (saveUsd === null) return null
  if (saveUsd > 0) return `Your verdict puts a heat pump ${usd(saveUsd)} a year ahead of today's setup. Staying keeps what you have.`
  if (saveUsd < 0) return `Your verdict puts a heat pump ${usd(saveUsd)} a year behind today's setup, so staying is a real option.`
  return 'Your verdict is about break-even, so staying costs you little.'
}

function supplyWhy(basic: BasicServiceRate | null, sponsor: SponsorKey | null, yourRate: number | null): string | null {
  if (!basic || basic.centsPerKwh === null || !sponsor) return null
  const base = `${SPONSOR_NAME[sponsor]} Basic Service is ${cents(basic.centsPerKwh)}/kWh for ${basic.period} (${basic.source}, ${basic.sourceDate}).`
  return yourRate !== null && yourRate > 0 ? `You entered ${cents(yourRate)}/kWh. ${base}` : base
}

function heatPumpWhy(tier: 'whole' | 'partial' | 'basic' | 'enhanced' | null, now: Date): string {
  const t = tier === 'enhanced' ? hp2026.tiers.enhanced : (hp2026.tiers[tier ?? 'whole'] ?? hp2026.tiers.whole)
  const left = daysUntil(hp2026.installWindow.to, now)
  const amount = t.perTonUsd === null ? `up to ${usd(t.capUsd)}` : `${usd(t.perTonUsd)}/ton, cap ${usd(t.capUsd)}`
  const deadline = left > 0 ? `${left} day${plural(left)} left at 2026 rates.` : 'The 2026 rates have ended.'
  return `Mass Save rebate in 2026: ${amount}. ${deadline}`
}

function Options({ choices, why, href }: { choices: SwitchChoice[]; why: Record<SwitchChoice, string | null>; href: string | null }) {
  return (
    <Section title="Your options">
      <ul className="flex flex-col gap-2">
        {choices.map((choice) => (
          <li key={choice} className="rounded-card border border-rule bg-surface p-3">
            <p className="text-small font-medium text-ink">{CHOICE_COPY[choice].label}</p>
            <p className="mt-0.5 text-micro text-ink-muted">{why[choice] ?? CHOICE_COPY[choice].detail}</p>
          </li>
        ))}
      </ul>
      {href ? (
        <a
          href={href}
          className="inline-flex h-9 items-center self-start rounded-md bg-ink px-3 text-small font-medium text-paper hover:bg-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
        >
          See your options →
        </a>
      ) : null}
      <Src>Nothing is preselected. The same options as your verdict.</Src>
    </Section>
  )
}

function Verdict({ saveUsd, back }: { saveUsd: number; back: string | null }) {
  return (
    <Section title="Your result">
      <p className="num text-body font-medium text-ink">
        {saveUsd > 0
          ? `Your verdict: you'd save ${usd(saveUsd)} a year`
          : saveUsd < 0
            ? `Your verdict: you'd pay ${usd(saveUsd)} more a year`
            : 'Your verdict: about break-even'}
      </p>
      <Src>From your verdict, computed from the details you gave there.</Src>
      {back ? (
        <a className="self-start text-small text-ink underline underline-offset-2" href={back}>
          ← Back to your verdict
        </a>
      ) : null}
    </Section>
  )
}

function Incentives({ energy, meta, town }: { energy: EnergyTown | null; meta: EnergyMeta | null; town: string }) {
  if (!energy || !meta) return null
  const src = meta.sources.usage
  if (energy.incentivesUsd !== null) {
    return (
      <P>
        Residents of {town} received {usd(energy.incentivesUsd)} in Mass Save electric incentives in {src.year}.{' '}
        <Src>{`${src.label} · ${src.year}`}</Src>
      </P>
    )
  }
  if (energy.usage.status === 'municipal') return null
  return (
    <P>
      Mass Save suppressed {town}&apos;s incentive total for privacy. <Src>{`${src.label} · ${src.year}`}</Src>
    </P>
  )
}

function SeasonalRate(props: { sponsor: SponsorKey | null; townSponsors: readonly SponsorKey[]; town: string; monthlyKwh: number | null }) {
  const { sponsor, townSponsors, monthlyKwh } = props
  if (sponsor === 'municipal') {
    return (
      <P>
        Seasonal heat pump rate (Nov 1 – Apr 30): not applicable. <Src>{MASS_SAVE_READ}</Src>
      </P>
    )
  }
  if (sponsor === null) {
    return (
      <P>
        The seasonal heat pump rate (Nov 1 – Apr 30) depends on which utility bills you. Eversource and Unitil take 7¢ off your rate per
        kWh; National Grid takes 4¢. <Src>{MASS_SAVE_READ}</Src>
      </P>
    )
  }
  const name = SPONSOR_NAME[sponsor]
  const basic = basicServiceRate(rateSponsorFor(sponsor, townSponsors))
  const sr = seasonalRate(sponsor, props.town.toLowerCase() === 'nantucket' ? null : (basic?.centsPerKwh ?? null))
  if (sr === null) {
    return (
      <P>
        {sponsor === 'cape_light' || sponsor === 'other'
          ? 'Check the seasonal heat pump rate with your utility.'
          : `Seasonal heat pump rate (Nov 1 – Apr 30): Mass Save takes ${cents(seasonalRate(sponsor, 0)?.offCents ?? 0)}/kWh off your rate. We have no ${name} Basic Service number on file, so read your own rate on your bill.`}{' '}
        <Src>{MASS_SAVE_READ}</Src>
      </P>
    )
  }
  const winter = monthlyKwh === null ? null : winterSavings(sr.offCents, monthlyKwh)
  return (
    <div className="flex flex-col gap-1">
      <P>
        Mass Save&apos;s heat pump rate takes {cents(sr.offCents)} off per kWh, Nov 1–Apr 30: on {name} Basic Service supply that&apos;s{' '}
        <b className="num font-medium">
          {cents(sr.fromCents)} → {cents(sr.toCents)}
        </b>
        .
      </P>
      <p className="text-micro text-ink-muted">
        The method is your rate minus {cents(sr.offCents)}/kWh. We applied it to Basic Service supply ({basic?.period}), not to your full bill
        rate, so your own figures differ.{' '}
        {basic ? `${basic.source}, ${basic.sourceDate}. ` : ''}
        {MASS_SAVE_READ}.
      </p>
      {winter ? (
        <div className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-3">
          <p className="num text-small font-medium text-ink">
            About {winter.display} less over the {SEASONAL_MONTHS} winter months on your current use
          </p>
          <p className="num text-micro text-ink-muted">{winter.formula}</p>
          <p className="text-micro text-ink-muted">Assumes {monthlyKwh} kWh every month. A heat pump adds kWh, billed at the lower rate.</p>
        </div>
      ) : (
        <p className="text-micro text-ink-muted">Enter your monthly kWh in My home to see what that is in dollars.</p>
      )}
    </div>
  )
}

function Rebate({ gate, fuel, now }: { gate: boolean | null; fuel: HeatingFuel | null; now: Date }) {
  if (gate === null) {
    return <P>Rebate amounts depend on who runs your program. Confirm the current offer before relying on a number.</P>
  }
  const upgrade = fuel === 'heat_pump'
  const t26 = upgrade ? hp2026.tiers.basic : hp2026.tiers.whole
  const t27 = upgrade ? hp2027.tiers.basic : hp2027.tiers.whole
  const left = daysUntil(hp2026.installWindow.to, now)
  return (
    <P>
      Mass Save {upgrade ? 'basic-tier' : 'whole-home'} heat pump rebate in 2026:{' '}
      <b className="num font-medium">
        {usd(t26.perTonUsd)}/ton, cap {usd(t26.capUsd)}
      </b>
      . Installs from {hp2027.installWindow.from}:{' '}
      <span className="num">
        {usd(t27.perTonUsd)}/ton, cap {usd(t27.capUsd)}
      </span>
      .{' '}
      {left > 0
        ? `${left} day${plural(left)} left to install at 2026 rates (through ${hp2026.installWindow.to}).`
        : left === 0
          ? `Last day to install at 2026 rates (${hp2026.installWindow.to}).`
          : 'The 2026 rates have ended.'}{' '}
      <Src>{MASS_SAVE_READ}</Src>
    </P>
  )
}

function Enhanced({ gate, fuel, income }: { gate: boolean | null; fuel: HeatingFuel | null; income: Profile['incomeEligible'] }) {
  if (gate !== true) return null
  if (fuel === 'gas') return <P>Standard rebates apply to gas-heated homes; the enhanced income-based tier doesn&apos;t.</P>
  if (fuel === 'heat_pump') return null
  const displaces = fuel === 'oil' || fuel === 'propane' || fuel === 'resistance'
  if (fuel !== null && !displaces) return null
  return (
    <P>
      {displaces ? 'If your income qualifies' : 'If you heat with oil, propane or electric resistance and your income qualifies'}, enhanced
      rebates reach {usd(hp2026.tiers.enhanced.capUsd)}, or no cost through Turnkey.
      {income === 'no' ? '' : ` Check eligibility: ${ASSESSMENT_PHONE}.`} <Src>{MASS_SAVE_READ}</Src>
    </P>
  )
}

function QuoteBlock({ facts, showAssessment }: { facts: Parameters<typeof buildQuoteRequest>[0]; showAssessment: boolean }) {
  const [consent, setConsent] = useState(false)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const draft = consent ? buildQuoteRequest(facts) : null

  async function copy() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
      setCopied('yes')
    } catch {
      setCopied('failed')
    }
  }

  const button =
    'inline-flex h-9 items-center rounded-md border border-rule-strong bg-surface px-3 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus'
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-2 text-small text-ink">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked)
            setCopied(null)
          }}
          className="mt-1 size-4"
        />
        <span>Draft a quote request with my town, heating fuel and home details. Nothing is sent until you send it.</span>
      </label>
      {draft ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-card border border-rule bg-paper p-3">
            <p className="text-micro text-ink-muted">Subject</p>
            <p className="text-small text-ink">{draft.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-small text-ink">{draft.body}</pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={button} href={draft.mailto}>
              Open in my email
            </a>
            <button type="button" className={button} onClick={copy}>
              Copy
            </button>
          </div>
          <p className="text-micro text-ink-muted" role="status">
            {copied === 'yes' ? 'Copied.' : copied === 'failed' ? 'Copy failed. Select the text above instead.' : ''}
          </p>
          <p className="text-micro text-ink-muted">You send it; Switchpoint doesn&apos;t send anything. Add your name and phone before you do.</p>
        </div>
      ) : null}
      {showAssessment ? (
        <div className="flex flex-col gap-1">
          <P>
            Ask Mass Save for a no-cost Home Energy Assessment. <Src>{MASS_SAVE_READ}</Src>
          </P>
          <P>
            Questions about income eligibility? Call Mass Save: <b className="num font-medium">{ASSESSMENT_PHONE}</b>.{' '}
            <Src>{MASS_SAVE_READ}</Src>
          </P>
        </div>
      ) : null}
    </div>
  )
}
