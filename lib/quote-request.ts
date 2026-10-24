/**
 * The quote-request draft. Deterministic: the same facts always give the same text.
 * It carries only what the caller passes in. No name, phone, email or street address
 * is ever added here, so the user adds their own before sending.
 */

import type { HeatingFuel, HomeType } from '@/components/map/types'

export interface QuoteFacts {
  town: string
  fuel: HeatingFuel | null
  home: HomeType | null
  /** Utility name, when known. */
  utility: string | null
  /** Monthly kWh the user entered; null when it is only the example value. */
  monthlyKwh: number | null
}

export interface QuoteRequest {
  subject: string
  body: string
  mailto: string
}

const FUEL_LABEL: Record<HeatingFuel, string> = {
  oil: 'heating oil',
  propane: 'propane',
  gas: 'natural gas',
  resistance: 'electric resistance',
  heat_pump: 'an existing heat pump',
}

const HOME_LABEL: Record<HomeType, string> = {
  single: 'single-family house',
  two_to_four: '2 to 4 unit building',
  condo: 'condo',
}

export function buildQuoteRequest(facts: QuoteFacts): QuoteRequest {
  const lines = [`Town: ${facts.town}`]
  if (facts.home) lines.push(`Home: ${HOME_LABEL[facts.home]}`)
  if (facts.fuel) lines.push(`Current heating: ${FUEL_LABEL[facts.fuel]}`)
  if (facts.utility) lines.push(`Electric utility: ${facts.utility}`)
  if (facts.monthlyKwh !== null) lines.push(`Electricity use: about ${facts.monthlyKwh} kWh a month`)

  const subject = `Heat pump quote request, ${facts.town}, MA`
  const body = [
    'Hello,',
    '',
    'I am looking at replacing my heating with a heat pump and would like a quote. A few facts about my home:',
    '',
    ...lines,
    '',
    'Please tell me:',
    '- the installed price, with the model and size you would use',
    '- which Mass Save rebate you expect to apply, and whether you handle the paperwork',
    '- how soon you could install',
    '',
    'Thank you.',
  ].join('\n')
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return { subject, body, mailto }
}
