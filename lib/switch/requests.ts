/**
 * @built F-147 the two request texts — only the facts R18.1 allows, assembled in code
 *
 * The model is not asked to write these. A sentence that goes to a provider must be
 * reproducible from the consent screen, so it is a template over `SharedFacts` and
 * nothing else. Tests assert the built text contains no identifying fact.
 */

import type { SharedFacts } from './types'

const FUEL_LABEL: Record<string, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
}

/** R18.1 fuel question, in the order a dealer answers it. */
export function fuelRequestText(facts: SharedFacts): string {
  const fuel = facts.fuel ? FUEL_LABEL[facts.fuel] : 'heating fuel'
  const volume = facts.annualVolume === null ? null : `${facts.annualVolume.toLocaleString('en-US')} ${facts.unit ?? 'units'}`
  const lines = [
    `Hello — I am asking about ${fuel} prices for a home in ${facts.town}${facts.zip ? `, ${facts.zip}` : ''}.`,
    volume ? `The house uses about ${volume} a year.` : null,
    `I would take ${facts.deliverySizeGal} gallons a delivery.${facts.tankSizeGal ? ` The tank is ${facts.tankSizeGal} gallons.` : ''}`,
    facts.deliveryWindow ? `The delivery window I am aiming for is ${facts.deliveryWindow}.` : null,
    'Could you tell me your cash/COD price per gallon today, any delivery or small-load fee, your minimum delivery, whether there is a card surcharge, and the earliest delivery date?',
    'If you offer a price cap or prebuy for this winter, please give that price and its fee as a separate number.',
  ].filter(Boolean)
  return lines.join('\n')
}

/** R18.1 installer question. The December deadline is the whole reason for the call. */
export function installerRequestText(facts: SharedFacts): string {
  const size = facts.tons === null ? null : `${facts.tons.toFixed(1)} tons`
  const lines = [
    `Hello — I am asking about a cold-climate air-source heat pump for a home in ${facts.town}${facts.zip ? `, ${facts.zip}` : ''}.`,
    facts.sqft !== null ? `The heated area is about ${facts.sqft.toLocaleString('en-US')} square feet.` : null,
    size ? `The calculated size is about ${size}.` : null,
    'Are you a Mass Save Heat Pump Installer Network contractor? Do you accept the 0% HEAT Loan? Can you finish an installation by 31 December 2026?',
    'What is your ballpark cost per ton, installed? A ballpark is enough for now.',
  ].filter(Boolean)
  return lines.join('\n')
}

export function requestSubject(kind: 'fuel' | 'installer', facts: SharedFacts): string {
  return kind === 'fuel'
    ? `Price request: ${facts.fuel ?? 'heating fuel'} in ${facts.town}`
    : `Heat pump quote request: ${facts.town}`
}

/** R20.8: the exact sentence for a phone call, readable before it is dialled. */
export function fuelPhoneScript(facts: SharedFacts): string {
  const fuel = facts.fuel ? FUEL_LABEL[facts.fuel] : 'heating fuel'
  const volume = facts.annualVolume === null ? 'a year' : `${facts.annualVolume.toLocaleString('en-US')} ${facts.unit ?? 'units'} a year`
  const tank = facts.tankSizeGal ? ` My tank is ${facts.tankSizeGal} gallons.` : ''
  const window = facts.deliveryWindow ? ` I am looking at ${facts.deliveryWindow}.` : ''
  return `“I am in ${facts.town}${facts.zip ? `, ${facts.zip}` : ''}, and I heat with ${fuel}. I use about ${volume}, and I would take ${facts.deliverySizeGal} gallons a delivery.${tank}${window} What is your cash/COD price per gallon today, is there a delivery or small-load fee, a minimum, or a card surcharge, and when could you deliver?”`
}

export function installerPhoneScript(facts: SharedFacts): string {
  const size = facts.tons === null ? '' : ` The calculated size is about ${facts.tons.toFixed(1)} tons.`
  const area = facts.sqft === null ? '' : ` It is about ${facts.sqft.toLocaleString('en-US')} square feet.`
  return `“I am in ${facts.town}${facts.zip ? `, ${facts.zip}` : ''}, looking for a cold-climate air-source heat pump quote.${area}${size} Are you in the Mass Save Heat Pump Installer Network, do you take the 0% HEAT Loan, and could you finish an install by 31 December 2026? What is your ballpark cost per ton, installed?”`
}

/** R17.4: supply is published, so the kit is a checklist, not a phone script. */
export function supplyKitScript(town: string): string {
  return `“I am in ${town} and I want to check my electricity supply. Please tell me the rate and whether it is fixed or variable, the contract end date, any early termination fee, and whether it renews automatically. Is this the town’s aggregation program or a competitive contract, and is there an exit fee to leave?”`
}

