import { CHOICE_COPY } from '../switch/choices'
import { outreachCopy, type OptionInput } from '../switch/option-cards'
import type { SwitchChoice } from '../switch/types'
import { shareableQuery } from './share-query'

export const RECHECK_LABEL = 'January 2027'

export interface SecondaryLine {
  choice: SwitchChoice
  text: string
  linkLabel: string
  href: string
}

interface Common {
  others: { choice: SwitchChoice; label: string; href: string }[]
  secondary: SecondaryLine | null
}

export type Recommendation =
  | (Common & {
      kind: 'stay'
      headline: string
      reminderLabel: string
    })
  | (Common & {
      kind: 'quotes'
      headline: string
      agentLabel: string
      agentLive: boolean
      agentNote: string
      agentHref: string
      kitHref: string
    })

export interface RecommendationInput {
  option: OptionInput
  choices: readonly SwitchChoice[]
  query: string
}

const usd = (value: number): string =>
  Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function switchHref(query: string, choice: SwitchChoice, mode?: 'kit'): string {
  const params = shareableQuery(query)
  params.set('choice', choice)
  if (mode) params.set('mode', mode)
  return `/switch?${params.toString()}`
}

function fuelSaving(option: OptionInput): { perUnit: number; annual: number | null; period: string | null } | null {
  const { unitPrice, market, annualUnits } = option
  if (market.price === null || unitPrice === null) return null
  const perUnit = unitPrice - market.price
  if (perUnit <= 0) return null
  return { perUnit, annual: annualUnits === null ? null : perUnit * annualUnits, period: market.period }
}

function secondaryFor(input: RecommendationInput): SecondaryLine | null {
  if (!input.choices.includes('SHOP_FUEL')) return null
  const saving = fuelSaving(input.option)
  if (!saving) return null
  const unit = input.option.fuel === 'propane' ? 'propane' : 'oil'
  const source = `MA DOER${saving.period ? `, ${saving.period}` : ''}`
  const annual = saving.annual === null ? '' : `, about ${usd(saving.annual)} a year`
  return {
    choice: 'SHOP_FUEL',
    text: `You pay $${saving.perUnit.toFixed(2)}/gal above the state ${unit} average (${source})${annual}. A cheaper dealer saves that without a heat pump.`,
    linkLabel: 'Compare dealer prices',
    href: switchHref(input.query, 'SHOP_FUEL'),
  }
}

function othersFor(input: RecommendationInput, recommended: SwitchChoice): Common['others'] {
  return input.choices
    .filter((choice) => choice !== recommended)
    .map((choice) => ({ choice, label: CHOICE_COPY[choice].label, href: switchHref(input.query, choice) }))
}

export function recommend(input: RecommendationInput): Recommendation {
  const { result } = input.option
  const stay = input.option.noMassSave || result.verdict === 'DO_NOT_SWITCH_YET'

  if (stay) {
    return {
      kind: 'stay',
      headline: `Our recommendation: stay with what you have. Check again in ${RECHECK_LABEL}, when prices and rebates reset.`,
      reminderLabel: `Add a reminder for ${RECHECK_LABEL}`,
      secondary: secondaryFor(input),
      others: othersFor(input, 'STAY'),
    }
  }

  const copy = outreachCopy('installers', input.option)
  const agentLive = copy.live
  const headline =
    result.verdict === 'SWITCH_BEFORE_DEC31'
      ? `Our recommendation: get heat pump quotes now, before 31 December. The rebate drops by ${usd(result.cliffCost)} on 1 January.`
      : 'Our recommendation: get heat pump quotes now'
  return {
    kind: 'quotes',
    headline,
    agentLabel: !agentLive
      ? 'See what the agent would say'
      : input.option.plan.mode === 'allowlist'
        ? 'Let our agent get quotes (test lines)'
        : 'Let our agent get quotes',
    agentLive,
    agentNote: copy.what,
    agentHref: switchHref(input.query, 'SWITCH_HEAT_PUMP'),
    kitHref: switchHref(input.query, 'SWITCH_HEAT_PUMP', 'kit'),
    secondary: null,
    others: othersFor(input, 'SWITCH_HEAT_PUMP'),
  }
}
