/**
 * @built F-166 the switch kit's step-by-step plan — the manual path, and the agent path
 *
 * The kit already carried the sentence to say and the list of things to have ready.
 * What it did not carry was the *order*: a household reading "here is who to call,
 * here is what to say" still has to work out what happens after the call, what a
 * good answer looks like, and what the deadline actually forces. So this module
 * writes the plan as numbered steps, and it writes two different plans:
 *
 *   - `agent` — an ElevenLabs agent is configured and may dial. The steps are what
 *     the agent will do, in the order it does it, and what the household does after;
 *   - `self` — no agent can place this call. The steps are what the household does
 *     themselves, including the four questions and what a non-answer means.
 *
 * Which one is printed is decided by the deployment's dial plan, never by a guess,
 * so the screen cannot promise a call this build cannot place. No step invents a
 * price, a phone number or a contractor.
 */

import type { SharedFacts } from './types'

/** The rebate deadline the installer question is about (R17.4). */
export const INSTALL_DEADLINE = '31 December 2026'

const MASS_SAVE_LIST = 'https://www.masssave.com/'

export type KitKind = 'fuel' | 'supply' | 'installer'

/** What the plan is for, and what this deployment can actually do about it. */
export interface KitPlanInput {
  kind: KitKind
  town: string
  facts: SharedFacts | null
  /**
   * The dial plan from `lib/calls/plan.ts`. `off` means no agent can place the
   * call, so the kit must teach the household to make it; `demo` replays a staged
   * conversation, which is the agent path with the calls not really happening.
   */
  mode: 'off' | 'allowlist' | 'live' | 'demo'
  /** Rows this deployment may contact, in display order. */
  providers: readonly { name: string; phone: string | null; allowlist: boolean }[]
}

export interface KitStep {
  title: string
  copy: string
}

export interface KitPlan {
  /** Which plan is printed. `agent` only when a dial is actually possible. */
  path: 'agent' | 'self'
  heading: string
  lede: string
  steps: KitStep[]
  /** The last line: what this plan will not do. */
  closing: string
}

function dialable(mode: KitPlanInput['mode']): boolean {
  return mode === 'live' || mode === 'allowlist' || mode === 'demo'
}

function tonsPhrase(facts: SharedFacts | null): string | null {
  if (!facts || facts.tons === null) return null
  return `${facts.tons.toFixed(1)} tons`
}

function sqftPhrase(facts: SharedFacts | null): string | null {
  if (!facts || facts.sqft === null) return null
  return `${facts.sqft.toLocaleString('en-US')} square feet`
}

/** The numbers this household would say, or a plain admission that one is missing. */
function sizeLine(facts: SharedFacts | null): string {
  const tons = tonsPhrase(facts)
  const sqft = sqftPhrase(facts)
  if (tons && sqft) return `the calculated size (${tons}) and the heated area (${sqft})`
  if (tons) return `the calculated size (${tons})`
  if (sqft) return `the heated area (${sqft})`
  return 'the calculated size and heated area, once the assessment has sized the house'
}

function contactLine(providers: KitPlanInput['providers']): string {
  const withPhone = providers.filter((provider) => provider.phone !== null)
  if (withPhone.length === 0) {
    return 'No contractor number is printed here: this build only shows a number it read from that contractor. The Mass Save network list is the source to pick two from.'
  }
  return withPhone
    .map((provider) => `${provider.name}${provider.phone === null ? '' : ` on ${provider.phone}`}${provider.allowlist ? ' (team test line)' : ''}`)
    .join(' · ')
}

function installerAgentPlan(input: KitPlanInput): KitPlan {
  const replay = input.mode === 'demo'
  return {
    path: 'agent',
    heading: 'Get the visit booked',
    lede: replay
      ? `The agent is replayed from a fixture in this mode, so read the steps as what a real run does: it dials two installers serving ${input.town}, asks four questions, and hands back the numbers with the sentence behind each one.`
      : `The agent places the calls. It says only what you approve, asks four questions, and comes back with the numbers. You do the decision and the booking.`,
    steps: [
      {
        title: 'You confirm what it may say',
        copy: `On the consent screen you tick the installers and approve ${sizeLine(input.facts)} for ${input.town}, plus the fuel you heat with today. Your name, street, phone, email, and income are never said.`,
      },
      {
        title: 'The agent dials, one installer at a time',
        copy: 'Calls go out Monday to Friday 8am–5pm and Saturday 8am–12pm Eastern. Outside that window a call is scheduled for the next window rather than placed.',
      },
      {
        title: 'It asks four questions, and nothing else',
        copy: `Are you in the Mass Save Heat Pump Installer Network? Do you take the 0% HEAT Loan? Can you finish an installation by ${INSTALL_DEADLINE}? What is your ballpark cost per ton, installed?`,
      },
      {
        title: 'The transcript comes back with the numbers',
        copy: 'Each answer keeps the sentence it came from, so a ballpark $/ton can be checked against what was actually said. A ballpark is never treated as a quote.',
      },
      {
        title: 'You compare, then book the assessment',
        copy: `The comparison ranks on $/ton and shows what each row did not answer. A Home Energy Assessment determines eligibility and the final size, and the ${INSTALL_DEADLINE} date is what the 2026 rebate depends on.`,
      },
    ],
    closing:
      'The agent never signs, never pays and never gives your contact details. If an installer offers to call you back, the household calls them.',
  }
}

function installerSelfPlan(input: KitPlanInput): KitPlan {
  return {
    path: 'self',
    heading: 'Get the visit booked',
    lede: `No agent can place this call on this deployment, so here is the whole path in order. Two calls of about five minutes each, then one assessment booking.`,
    steps: [
      {
        title: 'Pick two installers from the Mass Save network list',
        copy: `Open ${MASS_SAVE_LIST} and choose two heat pump installers that serve ${input.town}. Pick two rather than one: the $/ton spread between them is usually larger than the rebate difference. ${contactLine(input.providers)}`,
      },
      {
        title: 'Call and say the sentence',
        copy: 'The script above is the whole call. Read it, or let them hear it in your own words — the four questions are the part that must not be skipped.',
      },
      {
        title: 'Ask the four questions, in this order',
        copy: `(1) Are you in the Mass Save Heat Pump Installer Network? (2) Do you take the 0% HEAT Loan? (3) Can you finish an installation by ${INSTALL_DEADLINE}? (4) What is your ballpark cost per ton, installed?`,
      },
      {
        title: 'Write down two numbers and one date',
        copy: `Ask for the ballpark as a total and as $/ton, and for the earliest site visit. ${input.facts?.tons ? `At your size (${input.facts.tons.toFixed(1)} tons) a $/ton figure turns into a total in one multiplication, so ask for both if they only give one.` : 'Once the assessment sizes the house, a $/ton figure turns into a total in one multiplication.'}`,
      },
      {
        title: 'Treat a "no" as information, not a rejection',
        copy: `An installer who cannot finish by ${INSTALL_DEADLINE} is priced at the 2027 rebate rate, so the comparison is no longer like for like. An installer who does not take the HEAT Loan means the financing is on you; ask what they offer instead.`,
      },
      {
        title: 'Book the Home Energy Assessment, then the install',
        copy: 'The assessment determines eligibility and the final size. Book the install against the deadline in writing, with the date on the quote, before you pay a deposit.',
      },
    ],
    closing:
      'This build placed no call for you and printed no contractor number it did not read. Phone quotes are not contracts: confirm the price and the completion date in writing.',
  }
}

function fuelAgentPlan(input: KitPlanInput): KitPlan {
  const replay = input.mode === 'demo'
  return {
    path: 'agent',
    heading: 'Get a real price',
    lede: replay
      ? 'The agent is replayed from a fixture in this mode. The steps are what a real run does: it dials the dealers you approve and asks for today’s price.'
      : 'The agent places the calls and asks for today’s price per gallon. You keep the tank, the address and the card.',
    steps: [
      {
        title: 'You confirm what it may say',
        copy: `On the consent screen you approve ${input.town}${input.facts?.zip ? `, ${input.facts.zip}` : ''}, the fuel you burn, your yearly use, and the delivery size. Never your name, street, phone or account number.`,
      },
      {
        title: 'The agent dials, one dealer at a time',
        copy: 'Calls go out Monday to Friday 8am–5pm and Saturday 8am–12pm Eastern. Outside that window a call is scheduled rather than placed.',
      },
      {
        title: 'It asks for the cash/COD price and every fee',
        copy: 'Price per gallon today, delivery or small-load fee, minimum delivery, card surcharge, earliest delivery. A prebuy or price cap is asked for separately and never ranked against a cash price.',
      },
      {
        title: 'The prices are ranked at your own volume',
        copy: 'Every row is annualised at your yearly gallons, so a cheap gallon with a $60 delivery fee cannot win on the headline number alone.',
      },
      {
        title: 'You choose, and you order',
        copy: 'The best price can be written back into the verdict, which recomputes the same arithmetic. The order and the payment stay yours.',
      },
    ],
    closing: 'The agent never orders fuel, never gives the delivery address and never agrees to a price cap.',
  }
}

function fuelSelfPlan(input: KitPlanInput): KitPlan {
  const volume = input.facts?.annualVolume === null || input.facts?.annualVolume === undefined
    ? null
    : `${input.facts.annualVolume.toLocaleString('en-US')} ${input.facts.unit ?? 'units'} a year`
  return {
    path: 'self',
    heading: 'Get a real price',
    lede: 'No agent can place this call on this deployment, so here is the order to do it in. Three calls is usually enough.',
    steps: [
      {
        title: 'Start with the dealer who delivers now',
        copy: `Call your current dealer first. You already have a delivery history with them, which is the strongest thing you have in the conversation. ${contactLine(input.providers)}`,
      },
      {
        title: 'Call two others that deliver to ' + input.town,
        copy: 'Ask the same question in the same order, so the answers are comparable. Write each price down as you hear it rather than afterwards.',
      },
      {
        title: 'Say the sentence above, and take the price per gallon',
        copy: volume
          ? `Your yearly use is ${volume}. Ask for the cash/COD price today, then the delivery or small-load fee, the minimum, the card surcharge and the earliest delivery date.`
          : 'Ask for the cash/COD price today, then the delivery or small-load fee, the minimum, the card surcharge and the earliest delivery date.',
      },
      {
        title: 'Turn each answer into one number',
        copy: 'Price per gallon plus any fee divided by the gallons you take. That effective $/gal is the only fair comparison, and it is what the call board would have computed.',
      },
      {
        title: 'Order before the price moves',
        copy: 'A quote is good for the day it was given. If you want a price cap or a prebuy, ask for it in writing with the fee, and treat it as a bet on the winter rather than a discount.',
      },
    ],
    closing: 'Phone quotes are not contracts: confirm the price when you order, and check the surcharge before you pay by card.',
  }
}

function supplyPlan(): KitPlan {
  return {
    path: 'self',
    heading: 'Check supply before you move',
    lede: 'Supply is published, so nothing is called. Three checks, in order, and only the last one is a contract.',
    steps: [
      {
        title: 'Read your own supplier line',
        copy: 'Take the supply rate, not the all-in rate, from your current bill. Compare only supply-only numbers with supply-only numbers.',
      },
      {
        title: 'Check the two published routes',
        copy: `Your town's municipal aggregation program (the state list is linked below) and Energy Switch Massachusetts. Delivery stays with your utility either way.`,
      },
      {
        title: 'Read the terms before the rate',
        copy: 'Fixed or variable, contract end date, auto-renewal, and the early termination fee. A lower rate with a long exit fee is not a lower rate.',
      },
      {
        title: 'Record the date, then re-check',
        copy: 'Basic Service resets every six months, so a comparison is only true until the next reset. Put the reset date in your calendar.',
      },
    ],
    closing: 'Published, not a quote. Confirm the rate and the terms in writing before you agree.',
  }
}

/**
 * The plan for one kit render.
 * Guarantee: `path` is `agent` only when the dial plan says a call can be placed —
 * the mode is the authority, exactly as it is on the switch screen, because a
 * deployment with no provider list already reports `off`. Every plan has at least
 * one step, no plan prints a price, and no plan prints a phone number that the
 * caller did not pass in.
 */
export function kitPlan(input: KitPlanInput): KitPlan {
  const agent = dialable(input.mode)
  if (input.kind === 'supply') return supplyPlan()
  if (input.kind === 'installer') return agent ? installerAgentPlan(input) : installerSelfPlan(input)
  return agent ? fuelAgentPlan(input) : fuelSelfPlan(input)
}
