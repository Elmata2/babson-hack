/**
 * @built F-73 "Your bill" panel: what the household entered, set against published figures
 *
 * Only facts from My home appear as the household's own. Comparisons use dated
 * sources: Basic Service (supply-market.md), the EIA all-in average (context only)
 * and the town's utility (MassGIS). A household's kWh is never set against a town
 * average, because no household counts exist to build one.
 */

import type { ReactNode } from 'react'
import fuelSnapshot from '@/data/snapshots/fuel-2026-10-19.json'
import hp2026 from '@/data/rules/heat-pump-2026.json'
import type { SponsorKey } from '@/lib/elec-label'
import { SPONSOR_NAME, UTILITY_META, resolveUtility } from '@/lib/utility'
import { SUPPLY_LINKS, basicServiceRate, daysUntil, formatCents, monthlyDifferenceUsd } from '@/lib/supply'
import { MASS_SAVE_READ, massSaveGate, rateSponsorFor } from '@/lib/mass-save'
import type { BillPanelProps, HeatingFuel, Profile, SupplyChoice } from './types'

const usd = (n: number) => `$${n.toLocaleString('en-US')}`
const plural = (n: number) => (n === 1 ? '' : 's')
const EIA_CENTS = (fuelSnapshot.electricity.standardRate * 100).toFixed(2)

const SUPPLY_LABEL: Record<SupplyChoice, string> = {
  basic: 'Basic Service',
  aggregation: 'Municipal aggregation',
  competitive: 'Competitive supplier',
  unsure: 'Not sure',
}
const FUEL_LABEL: Record<HeatingFuel, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
  heat_pump: 'Heat pump',
}

function Src({ children, href }: { children: ReactNode; href?: string }) {
  const cls = 'text-micro text-ink-muted'
  return href ? (
    <a className={`${cls} underline underline-offset-2`} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span className={cls}>{children}</span>
  )
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
const Button = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="self-start rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus"
  >
    {children}
  </button>
)

function entries(profile: Profile, utilityName: string | null): [string, string][] {
  const rows: [string, string][] = []
  if (profile.address) rows.push(['Address', profile.address])
  else if (profile.town) rows.push(['Town', profile.town])
  if (utilityName) rows.push(['Delivered by', utilityName])
  if (profile.supply) rows.push(['Supply', SUPPLY_LABEL[profile.supply]])
  if (profile.supplierRateCents !== null) rows.push(['Supply rate', `${profile.supplierRateCents}¢/kWh`])
  if (profile.contractEnd) rows.push(['Contract ends', profile.contractEnd])
  if (!profile.kwhIsExample) rows.push(['Monthly use', `${profile.kwh.toLocaleString('en-US')} kWh`])
  if (profile.fuel) rows.push(['Heating fuel', FUEL_LABEL[profile.fuel]])
  return rows
}

export function BillPanel({ profile, onEditProfile, today }: BillPanelProps) {
  const now = today ?? new Date()
  const res = profile.town ? resolveUtility(profile.town) : null
  const known = res?.found ? res : null

  let sponsor: SponsorKey | null = null
  if (known) {
    if (known.mixed) sponsor = profile.utility && known.sponsors.includes(profile.utility) ? profile.utility : null
    else sponsor = known.sponsors[0] ?? null
  }

  const rows = entries(profile, sponsor ? SPONSOR_NAME[sponsor] : null)
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <P>Tell us about your home to see your bill here: your address, utility, supply, contract and monthly kWh. It stays in this browser.</P>
        <Button onClick={onEditProfile}>Fill in My home</Button>
      </div>
    )
  }

  const municipal = sponsor === 'municipal'
  const rateSponsor = sponsor && known ? rateSponsorFor(sponsor, known.sponsors) : null
  const basic = rateSponsor ? basicServiceRate(rateSponsor) : null
  const nantucket = known?.town.toLowerCase() === 'nantucket'
  const basicCents = nantucket ? null : (basic?.centsPerKwh ?? null)
  const gate = sponsor ? massSaveGate(sponsor) : null

  return (
    <div className="flex flex-col gap-5">
      <Section title="What you entered">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-micro text-ink-muted">{label}</dt>
              <dd className="text-small text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {known && sponsor ? <Src href={UTILITY_META.url}>{`MassGIS · Electricity Providers · fetched ${UTILITY_META.fetchedAt.slice(0, 10)}`}</Src> : null}
        <Button onClick={onEditProfile}>Edit My home</Button>
      </Section>

      {known && sponsor === null ? (
        <Section title="Which utility bills you?">
          <P>{known.question ?? `${known.town} is served by more than one utility.`}</P>
          <Button onClick={onEditProfile}>Answer in My home</Button>
        </Section>
      ) : null}

      {municipal ? (
        <Section title="Your supply">
          <P>Your town&apos;s light plant both supplies and delivers your power. There&apos;s no supplier to switch, and Mass Save electric rebates don&apos;t apply.</P>
        </Section>
      ) : null}

      {sponsor && !municipal ? (
        <SupplySection
          profile={profile}
          basic={basic}
          basicCents={basicCents}
          sponsorName={SPONSOR_NAME[rateSponsor ?? sponsor]}
          noNumberFor={nantucket ? 'Nantucket' : rateSponsor === 'unitil' ? 'Unitil' : basicCents === null ? 'your area' : null}
          now={now}
        />
      ) : null}

      {profile.contractEnd && (municipal || sponsor === null) ? <ContractLine profile={profile} now={now} /> : null}

      {gate !== false && sponsor ? <RebateDeadline fuel={profile.fuel} now={now} /> : null}

      <Section title="For context">
        <P>
          MA residential electricity averaged <span className="num">{EIA_CENTS}¢/kWh</span> all-in, July 2026.{' '}
          <Src>EIA · July 2026</Src>
        </P>
        <p className="text-micro text-ink-muted">
          The average includes delivery and fees. Basic Service and your supplier rate cover supply only, so they are not comparable to it.
          Context, not a verdict.
        </p>
      </Section>

      <p className="text-micro text-ink-muted">Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.</p>
    </div>
  )
}

function SupplySection(props: {
  profile: Profile
  basic: ReturnType<typeof basicServiceRate>
  basicCents: number | null
  sponsorName: string
  noNumberFor: string | null
  now: Date
}) {
  const { profile, basic, basicCents, sponsorName, noNumberFor, now } = props
  const { supply, supplierRateCents: rate, kwh, kwhIsExample } = profile

  const basicLine =
    basic && basicCents !== null ? (
      <P>
        {sponsorName} Basic Service: <b className="num font-medium">{formatCents(basicCents)}¢/kWh</b>, {basic.period}. Supply only; it resets every 6 months.{' '}
        <Src href={basic.url}>{`${basic.source} · ${basic.sourceDate}`}</Src>
      </P>
    ) : noNumberFor ? (
      <P>We have no Basic Service number for {noNumberFor}. Compare your rate with the utility&apos;s published Basic Service rate.</P>
    ) : null

  let comparison: ReactNode = null
  if (supply === 'unsure' || supply === null) {
    comparison = <P>Look at the Supplier line on your bill. If it names your utility, you are on Basic Service.</P>
  } else if (supply === 'basic') {
    comparison = <P>You told us you&apos;re on Basic Service, so your supply rate is the one above.</P>
  } else if (basicCents !== null && rate !== null && rate > 0 && !kwhIsExample && kwh > 0) {
    const d = monthlyDifferenceUsd({ supplierRateCents: rate, basicServiceCents: basicCents, kwh })
    const headline =
      d.usd > 0
        ? `You pay ${d.display}/month more than Basic Service`
        : d.usd < 0
          ? `You pay ${d.display}/month less than Basic Service`
          : 'You pay the same as Basic Service'
    comparison = (
      <div className="flex flex-col gap-1 rounded-card border border-rule bg-surface p-3">
        <p className="num text-small font-medium text-ink">{headline}</p>
        <p className="num text-micro text-ink-muted">{d.formula}</p>
        <p className="text-micro text-ink-muted">Basic Service resets every 6 months, so this comparison will change at the next reset.</p>
      </div>
    )
  } else if (basicCents !== null && rate !== null && rate > 0) {
    comparison = <p className="text-small text-ink-muted">Enter your monthly kWh in My home to see the monthly difference.</p>
  } else if (basicCents !== null) {
    comparison = <p className="text-small text-ink-muted">Enter your supply rate and monthly kWh in My home to see the monthly difference.</p>
  }

  return (
    <Section title="Your supply vs Basic Service">
      {basicLine}
      {comparison}
      {supply === 'competitive' || supply === 'unsure' ? (
        <Src href={SUPPLY_LINKS.energySwitch}>Compare offers: Energy Switch Massachusetts</Src>
      ) : null}
      {supply === 'aggregation' ? <Src href={SUPPLY_LINKS.municipalAggregation}>Mass.gov · municipal aggregation</Src> : null}
      {profile.contractEnd ? <ContractLine profile={profile} now={now} /> : null}
    </Section>
  )
}

function ContractLine({ profile, now }: { profile: Profile; now: Date }) {
  const { contractEnd, terminationFeeUsd: fee } = profile
  if (!contractEnd) return null
  const days = daysUntil(contractEnd, now)
  if (!Number.isFinite(days)) return null
  const when =
    days > 0
      ? `Your contract ends in ${days} day${plural(days)} (${contractEnd}).`
      : days === 0
        ? `Your contract ends today (${contractEnd}).`
        : `Your contract ended ${-days} day${plural(-days)} ago (${contractEnd}). Check whether it renewed.`
  return (
    <P>
      {when}{' '}
      {fee !== null && fee > 0
        ? `Leaving before then may cost the ${usd(fee)} early termination fee.`
        : 'Check your contract for an early termination fee before you leave.'}
    </P>
  )
}

function RebateDeadline({ fuel, now }: { fuel: HeatingFuel | null; now: Date }) {
  const tier = fuel === 'heat_pump' ? hp2026.tiers.basic : hp2026.tiers.whole
  const left = daysUntil(hp2026.installWindow.to, now)
  return (
    <Section title="Rebate deadline">
      <P>
        Mass Save {fuel === 'heat_pump' ? 'basic-tier' : 'whole-home'} heat pump rebate in 2026:{' '}
        <b className="num font-medium">
          {usd(tier.perTonUsd)}/ton, cap {usd(tier.capUsd)}
        </b>
        .{' '}
        {left > 0
          ? `${left} day${plural(left)} left to install at 2026 rates (through ${hp2026.installWindow.to}).`
          : left === 0
            ? `Last day to install at 2026 rates (${hp2026.installWindow.to}).`
            : 'The 2026 rates have ended.'}{' '}
        <Src>{MASS_SAVE_READ}</Src>
      </P>
    </Section>
  )
}
