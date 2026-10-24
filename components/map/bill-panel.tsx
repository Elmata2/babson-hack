/**
 * @built F-73 "Your bill" panel: delivery, supply options, bill checklist, heat pump rules
 *
 * Numbers come from data/rules/*.json and data/snapshots. The only figures that
 * live here are named constants cited to mass-save-rules.md.
 */

import type { ReactNode } from 'react'
import fuelSnapshot from '@/data/snapshots/fuel-2026-10-19.json'
import hp2026 from '@/data/rules/heat-pump-2026.json'
import hp2027 from '@/data/rules/heat-pump-2027.json'
import type { SponsorKey } from '@/lib/elec-label'
import { SEASONAL_RATE_ADJUSTMENT, SPONSOR_NAME, UTILITY_META, resolveUtility } from '@/lib/utility'
import {
  COMPETITIVE_OVERPAYMENT,
  MARKET_SPLIT,
  SUPPLY_LINKS,
  basicServiceRate,
  daysUntil,
  monthlyDifferenceUsd,
} from '@/lib/supply'
import { ASSESSMENT_PHONE, FEDERAL_25C_ENDED, HEAT_LOAN_MAX_USD, MASS_SAVE_READ, massSaveGate, rateSponsorFor } from '@/lib/mass-save'
import type { BillPanelProps } from './types'

// mass-save-rules.md §2 and §1 (income-based enhanced tier, verification number).
const ENHANCED_CAP_USD = hp2026.tiers.enhanced.capUsd

const usd = (n: number) => `$${n.toLocaleString('en-US')}`
const plural = (n: number) => (n === 1 ? '' : 's')
const MARKET_AS_OF = new Date(`${MARKET_SPLIT.asOf}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
const EIA_CENTS = (fuelSnapshot.electricity.standardRate * 100).toFixed(2)

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
    <section className="flex flex-col gap-2 border-t border-rule pt-4">
      <h3 className="text-small font-medium text-ink">{title}</h3>
      {children}
    </section>
  )
}

const P = ({ children }: { children: ReactNode }) => <p className="text-small text-ink">{children}</p>
const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
)

export function BillPanel({ town: townProp, profile, onEditProfile, today }: BillPanelProps) {
  const now = today ?? new Date()
  const town = townProp ?? (profile.town || null)

  if (!town) {
    return <p className="text-small text-ink-muted">Search for your address or pick a town to see your bill.</p>
  }

  const res = resolveUtility(town)
  if (!res.found) {
    return <p className="text-small text-ink">{res.question}</p>
  }

  const isHome = res.town === resolveUtility(profile.town).town && profile.town !== ''
  let sponsor: SponsorKey | null
  if (res.mixed) {
    sponsor = isHome && profile.utility && res.sponsors.includes(profile.utility) ? profile.utility : null
  } else {
    sponsor = res.sponsors[0] ?? null
  }

  if (sponsor === null) {
    return (
      <div className="flex flex-col gap-3">
        <P>
          {isHome
            ? (res.question ?? 'Which utility bills you?')
            : `${res.town} is served by more than one utility. Set it as your home in My home to pick yours.`}
        </P>
        {isHome && res.reason && <p className="text-micro text-ink-muted">{res.reason}</p>}
        <div>
          <button
            type="button"
            onClick={onEditProfile}
            className="rounded-md border border-rule-strong bg-surface px-3 py-2 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus"
          >
            Answer in My home
          </button>
        </div>
        <Src href={UTILITY_META.url}>{`MassGIS · Electricity Providers · fetched ${UTILITY_META.fetchedAt.slice(0, 10)}`}</Src>
      </div>
    )
  }

  const personal = isHome ? profile : null
  const municipal = sponsor === 'municipal'
  const capeLight = sponsor === 'cape_light'
  // Cape Light Compact: delivery is Eversource's. A number shows only when the town also lists Eversource.
  const rateSponsor = rateSponsorFor(sponsor, res.sponsors)
  const basic = basicServiceRate(rateSponsor)
  const nantucket = res.town.toLowerCase() === 'nantucket'
  const basicCents = nantucket ? null : (basic?.centsPerKwh ?? null)
  const deliveryName = capeLight ? SPONSOR_NAME.eversource : SPONSOR_NAME[sponsor]
  const fetched = UTILITY_META.fetchedAt.slice(0, 10)

  return (
    <div className="flex flex-col gap-5">
      <Section title="Who delivers your power">
        <P>
          <b className="font-medium">{deliveryName}</b>{' '}
          <Src href={UTILITY_META.url}>{`MassGIS · Electricity Providers · fetched ${fetched}`}</Src>
        </P>
        {capeLight && <P>Cape Light Compact runs the local energy programs.</P>}
        <P>
          {municipal
            ? "Your town's light plant both supplies and delivers your power. There's no supplier to switch, and Mass Save electric rebates don't apply."
            : "Delivery is fixed by your address. You can't switch it."}
        </P>
      </Section>

      {!municipal && (
        <Section title="Who supplies it: your three options">
          <div className="flex flex-col gap-3">
            <div>
              <P>
                <b className="font-medium">1. Basic Service.</b> The utility&apos;s default supply, approved by the DPU. It resets every 6
                months and covers supply only.
              </P>
              {basic && basicCents !== null && (
                <P>
                  <b className="num font-medium">{basicCents}¢/kWh</b> for {SPONSOR_NAME[rateSponsor]}, {basic.period}.{' '}
                  <Src href={basic.url}>{`${basic.source} · ${basic.sourceDate}`}</Src>
                </P>
              )}
              {rateSponsor === 'unitil' && basic && (
                <P>
                  No number here. See <Link href={basic.url}>Unitil&apos;s Basic Service rates</Link>.{' '}
                  <Src href={basic.url}>{`${basic.source} · ${basic.sourceDate}`}</Src>
                </P>
              )}
              {nantucket && <P>Nantucket Electric&apos;s own rate isn&apos;t in our source. Check with National Grid.</P>}
              {capeLight && basicCents === null && (
                <P>We have no Basic Service number for your area. Check with Cape Light Compact.</P>
              )}
            </div>
            <div>
              <P>
                <b className="font-medium">2. Municipal aggregation.</b> Your town buys supply for residents. You&apos;re enrolled unless
                you opt out, and there&apos;s no exit fee to opt out. Check whether your town has one:{' '}
                <Link href={SUPPLY_LINKS.municipalAggregation}>municipal aggregation on Mass.gov</Link>.
              </P>
              <Src href={SUPPLY_LINKS.municipalAggregation}>Mass.gov · municipal aggregation</Src>
            </div>
            <div>
              <P>
                <b className="font-medium">3. Competitive supplier.</b> You sign a contract yourself. Residential customers on competitive
                supply paid <span className="num">${(COMPETITIVE_OVERPAYMENT.usd / 1e6).toFixed(1)}M</span> more than Basic Service would
                have cost, {COMPETITIVE_OVERPAYMENT.period}. Watch for variable rates, auto-renewal and cancellation fees. Compare offers at{' '}
                <Link href={SUPPLY_LINKS.energySwitch}>Energy Switch Massachusetts</Link>.
              </P>
              <Src href={COMPETITIVE_OVERPAYMENT.url}>{COMPETITIVE_OVERPAYMENT.source}</Src>
            </div>
          </div>
          <p className="text-micro text-ink-muted">
            {MARKET_AS_OF}: <span className="num">{MARKET_SPLIT.aggregationPct}%</span> of customers on municipal aggregation,{' '}
            <span className="num">{MARKET_SPLIT.basicServicePct}%</span> on Basic Service,{' '}
            <span className="num">~{MARKET_SPLIT.competitivePctApprox}%</span> on a competitive supplier.{' '}
            <Src href={MARKET_SPLIT.url}>{MARKET_SPLIT.source}</Src>
          </p>

          {personal?.supply === 'unsure' && (
            <P>Look at the Supplier line on your bill. If it names your utility, you are on Basic Service.</P>
          )}
          {personal?.supply === 'competitive' && (
            <CompetitiveCompare
              basicCents={basicCents}
              noNumberFor={nantucket ? 'Nantucket' : rateSponsor === 'unitil' ? 'Unitil' : capeLight ? 'your area' : null}
              rate={personal.supplierRateCents}
              kwh={personal.kwh}
              kwhIsExample={personal.kwhIsExample}
              contractEnd={personal.contractEnd}
              fee={personal.terminationFeeUsd}
              now={now}
            />
          )}
        </Section>
      )}

      {!municipal && (
        <Section title="Before you switch, find these on your bill">
          <ul className="list-disc pl-5 text-small text-ink">
            <li>Supplier name</li>
            <li>Supply rate (¢/kWh)</li>
            <li>Contract end date</li>
            <li>Early termination fee</li>
            <li>Monthly kWh</li>
          </ul>
          <p className="text-micro text-ink-muted">Don&apos;t enter your account number here.</p>
        </Section>
      )}

      <HeatSection sponsor={sponsor} gate={isHome || !res.mixed ? massSaveGate(sponsor) : null} reason={res.reason} personal={personal} now={now} />

      <Section title="For context">
        <P>
          MA residential electricity averaged <span className="num">{EIA_CENTS}¢/kWh</span> all-in, July 2026.{' '}
          <Src>EIA · July 2026</Src>
        </P>
        <p className="text-micro text-ink-muted">Basic Service rates above are supply-only.</p>
      </Section>

      <p className="text-micro text-ink-muted">
        Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.
      </p>
    </div>
  )
}

function CompetitiveCompare(props: {
  basicCents: number | null
  noNumberFor: string | null
  rate: number | null
  kwh: number
  kwhIsExample: boolean
  contractEnd: string | null
  fee: number | null
  now: Date
}) {
  const { basicCents, noNumberFor, rate, kwh, kwhIsExample, contractEnd, fee, now } = props
  let comparison: ReactNode
  if (basicCents !== null && rate !== null && rate > 0 && kwh > 0) {
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
        {kwhIsExample && <p className="text-micro text-ink-muted">The {kwh} kWh is an example. Edit it in My home.</p>}
        <p className="text-micro text-ink-muted">Basic Service resets every 6 months, so this comparison will change at the next reset.</p>
      </div>
    )
  } else if (basicCents !== null && rate !== null && rate > 0) {
    comparison = <p className="text-small text-ink-muted">Enter your monthly kWh in My home to see the monthly difference.</p>
  } else if (noNumberFor) {
    comparison = <P>We have no Basic Service number for {noNumberFor}. Compare your rate with the utility&apos;s published Basic Service rate.</P>
  } else {
    comparison = <p className="text-small text-ink-muted">Enter your supplier rate and monthly kWh in My home to see the monthly difference.</p>
  }

  let contract: ReactNode = null
  if (contractEnd) {
    const days = daysUntil(contractEnd, now)
    if (Number.isFinite(days)) {
      const when =
        days > 0
          ? `Your contract ends in ${days} day${plural(days)} (${contractEnd}).`
          : days === 0
            ? `Your contract ends today (${contractEnd}).`
            : `Your contract ended ${-days} day${plural(-days)} ago (${contractEnd}). Check whether it renewed.`
      contract = (
        <P>
          {when}{' '}
          {fee !== null && fee > 0
            ? `Leaving before then may cost the ${usd(fee)} early termination fee.`
            : 'Check your contract for an early termination fee before you leave.'}
        </P>
      )
    }
  }
  return (
    <>
      {comparison}
      {contract}
    </>
  )
}

function HeatSection(props: {
  sponsor: SponsorKey
  gate: boolean | null
  reason: string | null
  personal: BillPanelProps['profile'] | null
  now: Date
}) {
  const { sponsor, gate, personal, now } = props
  const municipal = sponsor === 'municipal'
  const noMassSave = gate === false
  const adjustment = SEASONAL_RATE_ADJUSTMENT[sponsor]
  const whole26 = hp2026.tiers.whole
  const whole27 = hp2027.tiers.whole
  const left = daysUntil(hp2026.installWindow.to, now)
  const fuel = personal?.fuel ?? null
  const income = personal?.incomeEligible ?? null
  const displaces = fuel === 'oil' || fuel === 'propane' || fuel === 'resistance'

  return (
    <Section title="Heat pumps and your bill">
      {municipal ? (
        <P>
          Seasonal Heat Pump Rate (Nov 1 – Apr 30): not applicable. <Src>{MASS_SAVE_READ}</Src>
        </P>
      ) : adjustment !== null ? (
        <P>
          Seasonal Heat Pump Rate, Nov 1 – Apr 30: your rate − <span className="num">${Math.abs(adjustment).toFixed(2)}/kWh</span>.{' '}
          <Src>{MASS_SAVE_READ}</Src>
        </P>
      ) : (
        <P>Check the seasonal heat pump rate with {sponsor === 'cape_light' ? 'Cape Light Compact' : 'your utility'}.</P>
      )}

      {noMassSave ? (
        <P>Not available through Mass Save in your town.</P>
      ) : gate === null ? (
        <P>Rebate amounts depend on who runs your program. Confirm the current offer before relying on a number.</P>
      ) : (
        <P>
          Mass Save whole-home heat pump rebate:{' '}
          <b className="num font-medium">
            {usd(whole26.perTonUsd)}/ton, cap {usd(whole26.capUsd)}
          </b>{' '}
          in 2026. Installs from {hp2027.installWindow.from}:{' '}
          <span className="num">
            {usd(whole27.perTonUsd)}/ton, cap {usd(whole27.capUsd)}
          </span>
          .{' '}
          {left > 0
            ? `${left} day${plural(left)} left to install at 2026 rates (through ${hp2026.installWindow.to}).`
            : left === 0
              ? `Last day to install at 2026 rates (${hp2026.installWindow.to}).`
              : 'The 2026 rates have ended.'}{' '}
          <Src>{MASS_SAVE_READ}</Src>
        </P>
      )}

      {fuel === 'gas' && gate !== false && <P>Standard rebates apply; the enhanced income-based tier doesn&apos;t.</P>}
      {gate !== false && (income === 'yes' || income === 'unsure') && displaces && (
        <P>
          Enhanced rebates up to <span className="num">{usd(ENHANCED_CAP_USD)}</span>, or no cost through Turnkey. Check eligibility:{' '}
          {ASSESSMENT_PHONE}. <Src>{MASS_SAVE_READ}</Src>
        </P>
      )}

      <P>
        {noMassSave
          ? `0% HEAT Loan (up to ${usd(HEAT_LOAN_MAX_USD)}) needs a Mass Save sponsor. You may qualify through your gas utility. Check with Mass Save.`
          : `0% HEAT Loan up to ${usd(HEAT_LOAN_MAX_USD)}. It's a loan, not a rebate.`}{' '}
        Federal 25C credit: expired {FEDERAL_25C_ENDED}.
      </P>

      {personal?.solar === 'yes' && <P>Ask your utility about net metering credits.</P>}
      {personal?.ev === 'yes' && <P>Charging adds to your kWh; recheck the comparison above.</P>}
    </Section>
  )
}
