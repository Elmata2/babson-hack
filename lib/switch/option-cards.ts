/**
 * @built F-152 optionCard — the decision step's copy, as a pure function of figures already computed
 *
 * Each card answers three questions in plain words: why this household would pick
 * the option, who does what, and what the household's own effort is. Every number
 * comes from the verdict result, the dated fuel yardstick or the published Basic
 * Service rate. What the agent does is read from the outreach plan, so the card can
 * never promise more than this deployment does: email only, no phone calls, replies
 * not parsed, and nothing at all when outreach is off.
 */

import type { Fuel, VerdictResult } from '../calc/types'
import { MAX_PROVIDERS_PER_SESSION } from './consent'
import type { SwitchChoice } from './types'

export interface OptionInput {
  result: VerdictResult
  fuel: Fuel | null
  unitPrice: number | null
  annualUnits: number | null
  market: { price: number | null; period: string | null }
  basic: { centsPerKwh: number | null; source: string; sourceDate: string } | null
  noMassSave: boolean
  plan: { mode: 'off' | 'allowlist' | 'live' }
  /** Providers the agent could actually reach in this mode: email-capable and non-test in live, test lines in allowlist. */
  reachable: { fuel: number; installer: number }
}

export interface OptionCard {
  choice: SwitchChoice
  name: string
  why: string
  what: string
  effort: string
  agent: { label: string; live: boolean } | null
  selfLabel: string
  /** True when the self button is the card's only action, so it carries the filled weight. */
  primary: boolean
}

const usd = (value: number): string =>
  Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const cents = (dollarsPerKwh: number): string => `${(dollarsPerKwh * 100).toFixed(1)}¢/kWh`

function breakEven(result: VerdictResult): string {
  return result.breakEvenElectricPrice === null
    ? 'The break-even price could not be computed.'
    : `The answer flips if electricity passes ${cents(result.breakEvenElectricPrice)}.`
}

function stayWhy(input: OptionInput): string {
  const { result } = input
  if (result.verdict === 'DO_NOT_SWITCH_YET') {
    return `At ${cents(result.heatPumpRate)} a heat pump costs ${usd(result.annualSavings)} a year more than your current fuel, so waiting costs you no money. ${breakEven(result)}`
  }
  const cliff =
    result.installYear === 2026 && result.cliffCost > 0
      ? ` and ${usd(result.cliffCost)} of rebate steps down on 1 January`
      : ''
  return `Choose this if you want to wait. A heat pump would save ${usd(result.annualSavings)} a year, so waiting gives that up${cliff}. ${breakEven(result)}`
}

function fuelWhy(input: OptionInput): string {
  const { unitPrice, annualUnits, market } = input
  const label = input.fuel === 'propane' ? 'propane' : 'oil'
  if (market.price === null || unitPrice === null || unitPrice <= 0) {
    return 'There is no dated state average to compare against, so a dealer quote is the only real number.'
  }
  const source = `MA DOER${market.period ? `, ${market.period}` : ''}`
  const diff = unitPrice - market.price
  if (diff > 0) {
    const annual =
      annualUnits !== null
        ? ` At ${annualUnits.toLocaleString('en-US')} gal a year that is about ${usd(diff * annualUnits)}.`
        : ''
    return `You pay $${diff.toFixed(2)}/gal more than the $${market.price.toFixed(2)} state ${label} average (${source}).${annual}`
  }
  return `You pay $${unitPrice.toFixed(2)}/gal, at or below the $${market.price.toFixed(2)} state ${label} average (${source}). A quote gives you a second number, not a likely saving.`
}

function supplyWhy(input: OptionInput): string {
  const { basic } = input
  if (!basic || basic.centsPerKwh === null) {
    return 'No supply-only rate is published for this sponsor, so none is printed. The state aggregation list and Energy Switch are the sources.'
  }
  return `Basic Service is ${basic.centsPerKwh.toFixed(1)}¢/kWh supply only (${basic.source}, ${basic.sourceDate}). We do not know your own rate, so a saving exists only if your bill shows more.`
}

function heatPumpWhy(input: OptionInput): string {
  const { result } = input
  if (input.noMassSave) {
    return `No Mass Save rebate applies here. The same heat costs ${usd(result.newAnnualCostHeatPumpRate)} a year on electricity against ${usd(result.oldAnnualCost)} for your fuel.`
  }
  if (result.verdict === 'DO_NOT_SWITCH_YET') {
    return `At current prices it costs ${usd(result.annualSavings)} a year more to run. A quote can change the install cost, not the running cost. ${breakEven(result)}`
  }
  const cliff =
    result.installYear === 2026 && result.cliffCost > 0
      ? ` ${usd(result.cliffCost)} of that rebate steps down for installs on or after 1 January.`
      : ''
  return `Saves ${usd(result.annualSavings)} a year at ${cents(result.heatPumpRate)}, with a ${usd(result.totalRebate)} rebate against ${usd(result.installCost)} installed.${cliff}`
}

type Who = 'dealers' | 'installers'

function agentMode(input: OptionInput, who: Who): 'off' | 'allowlist' | 'live' {
  const count = input.reachable[who === 'dealers' ? 'fuel' : 'installer']
  return count === 0 ? 'off' : input.plan.mode
}

function agentWhat(input: OptionInput, who: Who): string {
  const mode = agentMode(input, who)
  const count = Math.min(MAX_PROVIDERS_PER_SESSION, input.reachable[who === 'dealers' ? 'fuel' : 'installer'])
  if (mode === 'off') {
    const why =
      input.plan.mode === 'off'
        ? 'The agent is switched off in this build'
        : `No ${who === 'dealers' ? 'dealer' : 'installer'} the agent can reach is configured in this build`
    return `${why}, so nothing is sent. Open this to read exactly what it would say to ${who}, then use the kit to ask them yourself.`
  }
  if (mode === 'allowlist') {
    return 'You tick providers and confirm the facts. The agent then contacts team test lines only, not real businesses, and the statuses are staged for the demo.'
  }
  return `After you consent, the agent emails up to ${count} ${who} you tick, saying only the facts you have read. It places no phone calls and does not read replies. You compare what comes back and choose.`
}

function agentCard(
  choice: 'SHOP_FUEL' | 'SWITCH_HEAT_PUMP',
  input: OptionInput,
  fields: { name: string; why: string; who: Who },
): OptionCard {
  const mode = agentMode(input, fields.who)
  const live = mode !== 'off'
  return {
    choice,
    name: fields.name,
    why: fields.why,
    what: agentWhat(input, fields.who),
    effort: live
      ? 'You tick providers and confirm once. Replies are yours to compare.'
      : 'With the kit you make the contact yourself. The question and what to have ready are written out.',
    agent: {
      label: !live
        ? 'See what the agent would say'
        : mode === 'allowlist'
          ? 'Let the agent get quotes (test lines)'
          : 'Let the agent get quotes',
      live,
    },
    selfLabel: 'Do it myself with the kit',
    primary: false,
  }
}

/**
 * One card per choice. Guarantee: STAY is built like the others, nothing is marked
 * selected, and an agent action exists only for the two choices where outreach can
 * happen.
 */
export function optionCard(choice: SwitchChoice, input: OptionInput): OptionCard {
  switch (choice) {
    case 'STAY':
      return {
        choice,
        name: 'Stay as you are',
        why: stayWhy(input),
        what: 'Nothing is sent and nothing changes. You see the figures that would change the answer, and can save the decision in this tab.',
        effort: 'Nothing to do.',
        agent: null,
        primary: true,
        selfLabel: 'Stay: show me the tripwire',
      }
    case 'SHOP_FUEL':
      return agentCard(choice, input, { name: 'Shop heating fuel', why: fuelWhy(input), who: 'dealers' })
    case 'SHOP_SUPPLY':
      return {
        choice,
        name: 'Shop electricity supply',
        why: supplyWhy(input),
        what: 'Supply rates are published, so no one is called. You compare rates yourself, with the sources and a formula that uses your own numbers.',
        effort: 'Two numbers from your electric bill.',
        agent: null,
        primary: true,
        selfLabel: 'Compare supply myself',
      }
    case 'SWITCH_HEAT_PUMP':
      return agentCard(choice, input, { name: 'Get heat pump quotes', why: heatPumpWhy(input), who: 'installers' })
  }
}

export function optionsSummary(count: number): string {
  return `You have ${count} option${count === 1 ? '' : 's'}. Here's why you'd pick each.`
}
