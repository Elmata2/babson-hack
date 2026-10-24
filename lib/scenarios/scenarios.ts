/**
 * The scenario matrix: every distinct outcome the app can show, as a pair of
 * synthetic bills plus the outcome those bills must produce.
 *
 * One definition feeds three consumers. `scripts/demo-bills/scenarios.mjs` renders the
 * bills from `electric` and `heating`. `__tests__/scenarios.test.ts` runs the reader
 * JSON built here through the real pipeline. `scripts/scenarios-report.mjs` walks the
 * same list against a running build. This file imports types only, so Node can load it
 * without a bundler.
 *
 * Every number is invented. Every rendered document says SAMPLE and uses fictional
 * dealers and suppliers; the utilities are named in plain text only.
 */
import type { BillUtility } from '../parse/contract'
import type { Fuel, Tier, Verdict } from '../calc/types'
import type { HeadlineCase } from '../verdict/headline'
import type { SwitchChoice } from '../switch/types'

export const SCENARIO_DATE = '2026-10-20'

export type ElectricClass = 'R-1' | 'R-2'

export interface ElectricFacts {
  utility: BillUtility
  utilityName: string
  rateClass: ElectricClass
  date: string
  days: number
  /** Twelve months ending in the bill's month, oldest first. The last is this bill's usage. */
  history: number[]
  historyKind: 'numbers' | 'bars'
  allInRate: number
  supplyRate: number
  supplier: string
  supplierContact?: string
  supplyNote?: string
  assistance: boolean
}

export interface OilFacts {
  kind: 'oil' | 'propane'
  dealer: string
  dealerTown: string
  ticketNo: string
  date: string
  lastDelivery: string
  gallons: number
  pricePerGal: number
  tankGal: number
  degreeDays: number
}

export interface GasFacts {
  kind: 'gas'
  utilityName: string
  date: string
  days: number
  therms: number
  allInRate: number
  supplyRate: number
  rateClass: 'R-3' | 'R-4'
  assistance: boolean
}

export interface ElectricHeatFacts {
  kind: 'electric'
}

export type HeatingFacts = OilFacts | GasFacts | ElectricHeatFacts

export type ScenarioFlag =
  | 'enhanced_tier'
  | 'enhanced_declined_for_gas'
  | 'rebate_covers_install'
  | 'loan_cap_exceeded'
  | 'competitive_above_basic'
  | 'refusal_not_verdict'
  | 'asks_utility'
  | 'bill_settles_mixed_town'
  | 'no_seasonal_rate'
  | 'negative_cash_flow'

export interface Expected {
  verdict: Verdict
  headlineCase: HeadlineCase
  /** Source of a RegExp the one-sentence headline must match. */
  headlinePattern: string
  recommendation: 'stay' | 'quotes' | 'light_plant'
  choices: SwitchChoice[]
  noMassSave: boolean
  tier: Tier
  flags: ScenarioFlag[]
}

export interface Scenario {
  id: string
  title: string
  covers: string
  town: string
  zip: string
  fuel: Fuel
  installYear: 2026 | 2027
  household: { size: number; income: number } | null
  quote: number | null
  electric: ElectricFacts
  heating: HeatingFacts
  expected: Expected
}

const EVERSOURCE = { utility: 'eversource', utilityName: 'Eversource' } as const
const NATIONAL_GRID = { utility: 'national_grid', utilityName: 'National Grid' } as const
const UNITIL = { utility: 'unitil', utilityName: 'Unitil' } as const

const ALL_FOUR: SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']
const NO_SUPPLY: SwitchChoice[] = ['STAY', 'SHOP_FUEL', 'SWITCH_HEAT_PUMP']
const GAS_CHOICES: SwitchChoice[] = ['STAY', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP']

const SAVE_SWITCH = '^You’d save \\$[\\d,]+ a year on heating\\.$'
const LOSE_STAY = '^You’d pay \\$[\\d,]+ a year more\\.$'

/** About 6,600 kWh a year: a house whose electricity is not its heat. */
const LIGHT_USE = [520, 580, 640, 610, 560, 500, 450, 520, 640, 510, 520, 550]
const LIGHT_USE_ALT = [610, 640, 700, 660, 600, 560, 520, 580, 690, 580, 590, 610]
/** About 12,600 kWh a year with a winter hump: electric resistance heat. */
const RESISTANCE_USE = [1300, 900, 650, 520, 560, 600, 620, 800, 1300, 1750, 1900, 1700]

const electricBase = {
  date: SCENARIO_DATE,
  days: 31,
  historyKind: 'numbers',
  supplier: 'Basic Service',
  assistance: false,
} as const

const oilTicket = (over: Partial<OilFacts> & Pick<OilFacts, 'dealer' | 'dealerTown' | 'ticketNo'>): OilFacts => ({
  kind: 'oil',
  date: SCENARIO_DATE,
  lastDelivery: '2026-04-09',
  gallons: 140,
  pricePerGal: 6.23,
  tankGal: 275,
  degreeDays: 886,
  ...over,
})

const oilFramingham = oilTicket({ dealer: 'Concord Valley Fuel (fictional)', dealerTown: 'Framingham', ticketNo: '0090011' })

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'oil-enhanced-income',
    title: 'Oil, income-qualified, enhanced rebate',
    covers: 'Oil home on a discount rate (R-2 plus an Assistance Rate Discount line): income reads as yes and the enhanced tier applies.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2026,
    household: null,
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-2', history: LIGHT_USE, allInRate: 0.2498, supplyRate: 0.173, assistance: true },
    heating: oilFramingham,
    expected: {
      verdict: 'SWITCH_NOW',
      headlineCase: 'save_switch',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'enhanced',
      flags: ['enhanced_tier'],
    },
  },
  {
    id: 'oil-standard-income-2027',
    title: 'Oil, standard income, install in 2027',
    covers: 'Oil home over the income limit, installing after the 1 January step-down so there is no deadline left: SWITCH_NOW.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2027,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.3049, supplyRate: 0.173 },
    heating: oilFramingham,
    expected: {
      verdict: 'SWITCH_NOW',
      headlineCase: 'save_switch',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: [],
    },
  },
  {
    id: 'oil-standard-before-dec31',
    title: 'Oil, standard income, install in 2026',
    covers: 'Oil home on the standard whole-home rebate: the rebate drops on 1 January, so the verdict is SWITCH_BEFORE_DEC31.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.3049, supplyRate: 0.173 },
    heating: oilFramingham,
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: [],
    },
  },
  {
    id: 'propane-national-grid',
    title: 'Propane, National Grid, standard income',
    covers: 'Propane home in a National Grid town (smaller seasonal rate cut), numeric 13-month usage table.',
    town: 'Worcester',
    zip: '01603',
    fuel: 'propane',
    installYear: 2026,
    household: { size: 3, income: 260_000 },
    quote: null,
    electric: { ...electricBase, ...NATIONAL_GRID, rateClass: 'R-1', history: LIGHT_USE, allInRate: 0.3112, supplyRate: 0.141 },
    heating: {
      kind: 'propane',
      dealer: 'Quinsigamond Gas & Heat (fictional)',
      dealerTown: 'Worcester',
      ticketNo: '0031744',
      date: SCENARIO_DATE,
      lastDelivery: '2026-05-02',
      gallons: 190,
      pricePerGal: 3.91,
      tankGal: 500,
      degreeDays: 1_050,
    },
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['negative_cash_flow'],
    },
  },
  {
    id: 'gas-do-not-switch',
    title: 'Natural gas, standard rate',
    covers: 'Gas home on R-3: gas is cheap, so a heat pump costs more to run and the answer is stay. Gas has no fuel to shop.',
    town: 'Cambridge',
    zip: '02139',
    fuel: 'gas',
    installYear: 2026,
    household: null,
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE, allInRate: 0.3049, supplyRate: 0.173 },
    heating: {
      kind: 'gas',
      utilityName: 'Eversource',
      date: '2026-02-05',
      days: 31,
      therms: 190,
      allInRate: 1.7,
      supplyRate: 0.89,
      rateClass: 'R-3',
      assistance: false,
    },
    expected: {
      verdict: 'DO_NOT_SWITCH_YET',
      headlineCase: 'lose_stay',
      headlinePattern: LOSE_STAY,
      recommendation: 'stay',
      choices: GAS_CHOICES,
      noMassSave: false,
      tier: 'whole',
      flags: [],
    },
  },
  {
    id: 'gas-discount-rate',
    title: 'Natural gas on a discount rate (R-4)',
    covers: 'Gas bill on R-4 with a discount line: income reads yes, but the enhanced tier is closed to gas, so the app says so out loud.',
    town: 'Boston',
    zip: '02116',
    fuel: 'gas',
    installYear: 2026,
    household: null,
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE, allInRate: 0.3049, supplyRate: 0.173 },
    heating: {
      kind: 'gas',
      utilityName: 'Eversource',
      date: '2026-02-05',
      days: 31,
      therms: 190,
      allInRate: 1.7,
      supplyRate: 0.89,
      rateClass: 'R-4',
      assistance: true,
    },
    expected: {
      verdict: 'DO_NOT_SWITCH_YET',
      headlineCase: 'lose_stay',
      headlinePattern: LOSE_STAY,
      recommendation: 'stay',
      choices: GAS_CHOICES,
      noMassSave: false,
      tier: 'whole',
      flags: ['enhanced_declined_for_gas'],
    },
  },
  {
    id: 'electric-resistance',
    title: 'Electric resistance heat',
    covers: 'The electric bill is the heating bill: baseload comes off the printed history and the remainder is priced as resistance heat.',
    town: 'Springfield',
    zip: '01103',
    fuel: 'resistance',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: RESISTANCE_USE, historyKind: 'bars', allInRate: 0.3049, supplyRate: 0.173 },
    heating: { kind: 'electric' },
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ['STAY', 'SHOP_SUPPLY', 'SWITCH_HEAT_PUMP'],
      noMassSave: false,
      tier: 'whole',
      flags: [],
    },
  },
  {
    id: 'municipal-light-plant',
    title: 'Municipal light plant town (Wellesley)',
    covers: 'A town-owned utility: no Mass Save electric rebate exists, so the screen refuses to print a rebate and recommends staying.',
    town: 'Wellesley',
    zip: '02482',
    fuel: 'oil',
    installYear: 2026,
    household: null,
    quote: null,
    electric: {
      ...electricBase,
      utility: 'municipal',
      utilityName: 'Wellesley Municipal Light Plant (sample)',
      rateClass: 'R-1',
      history: LIGHT_USE,
      allInRate: 0.2312,
      supplyRate: 0.118,
      supplier: 'Town light plant supply',
    },
    heating: oilTicket({ dealer: 'Charles River Oil (fictional)', dealerTown: 'Natick', ticketNo: '0044120' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'light_plant',
      choices: NO_SUPPLY,
      noMassSave: true,
      tier: 'whole',
      flags: ['refusal_not_verdict'],
    },
  },
  {
    id: 'mixed-town-bill-says-eversource',
    title: 'Mixed-utility town, bill names Eversource',
    covers: 'Westport is served by two sponsors. An Eversource bill settles it, so the rebate and the supply comparison both apply.',
    town: 'Westport',
    zip: '02790',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE, allInRate: 0.3049, supplyRate: 0.173 },
    heating: oilTicket({ dealer: 'Acoaxet Fuel (fictional)', dealerTown: 'Westport', ticketNo: '0020871' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['bill_settles_mixed_town'],
    },
  },
  {
    id: 'mixed-town-bill-says-municipal',
    title: 'Mixed-utility town, bill names the light plant',
    covers: 'Lakeville has a light plant and Eversource. A light-plant bill settles it the other way: no Mass Save rebate.',
    town: 'Lakeville',
    zip: '02347',
    fuel: 'oil',
    installYear: 2026,
    household: null,
    quote: null,
    electric: {
      ...electricBase,
      utility: 'municipal',
      utilityName: 'Lakeville Municipal Light Department (sample)',
      rateClass: 'R-1',
      history: LIGHT_USE,
      allInRate: 0.2388,
      supplyRate: 0.121,
      supplier: 'Town light department supply',
    },
    heating: oilTicket({ dealer: 'Assawompset Oil (fictional)', dealerTown: 'Lakeville', ticketNo: '0017733' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'light_plant',
      choices: NO_SUPPLY,
      noMassSave: true,
      tier: 'whole',
      flags: ['refusal_not_verdict', 'bill_settles_mixed_town'],
    },
  },
  {
    id: 'competitive-supplier',
    title: 'Competitive supplier above Basic Service',
    covers: 'Eversource bill with a fictional competitive supplier at 21.9 cents against Basic Service: the household rate is higher and shopping supply is on the table.',
    town: 'Boston',
    zip: '02116',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: {
      ...electricBase,
      ...EVERSOURCE,
      rateClass: 'R-1',
      history: LIGHT_USE,
      allInRate: 0.3492,
      supplyRate: 0.219,
      supplier: 'XYZ Energy (fictional)',
      supplierContact: 'XYZ Energy (fictional)<br>PO Box 000, Anytown MA 00000<br>(555) 010-0177<br>Rate: 21.900¢/kWh, variable, month to month',
      supplyNote: 'Your introductory fixed price ended 08/31/2026. You are now on our month-to-month variable rate.',
    },
    heating: oilTicket({ dealer: 'Back Bay Fuel & Service (fictional)', dealerTown: 'Boston', ticketNo: '0072290' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['competitive_above_basic'],
    },
  },
  {
    id: 'high-quote-over-loan-cap',
    title: 'High install quote, above the $25,000 loan cap',
    covers: 'A contractor quote of $38,000: the rebate does not cover it and the 0% HEAT Loan stops at $25,000, so a remainder is left. Savings still pay it back inside 15 years.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: 38_000,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.3049, supplyRate: 0.173 },
    heating: oilFramingham,
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['loan_cap_exceeded', 'negative_cash_flow'],
    },
  },
  {
    id: 'very-high-quote-payback-fails',
    title: 'Very high install quote, payback past 15 years',
    covers: 'A $60,000 quote: savings are real but take more than 15 years to repay it, so the verdict is wait.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: 60_000,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.3049, supplyRate: 0.173 },
    heating: oilFramingham,
    expected: {
      verdict: 'DO_NOT_SWITCH_YET',
      headlineCase: 'save_but_wait',
      headlinePattern: '^You’d save \\$[\\d,]+ a year, but it takes [\\d.]+ years to pay back\\.$',
      recommendation: 'stay',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['loan_cap_exceeded'],
    },
  },
  {
    id: 'low-quote-rebate-covers',
    title: 'Very low install quote, rebate covers it',
    covers: 'Income-qualified household with a $9,000 quote: the enhanced rebate is the lower of cost and cap, so the net cost is zero.',
    town: 'Framingham',
    zip: '01701',
    fuel: 'oil',
    installYear: 2026,
    household: null,
    quote: 9_000,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-2', history: LIGHT_USE, allInRate: 0.2498, supplyRate: 0.173, assistance: true },
    heating: oilFramingham,
    expected: {
      verdict: 'SWITCH_NOW',
      headlineCase: 'save_switch',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'enhanced',
      flags: ['enhanced_tier', 'rebate_covers_install'],
    },
  },
  {
    id: 'unitil-oil',
    title: 'Unitil town (Fitchburg), oil',
    covers: 'Unitil sponsors the town: the Mass Save seasonal heat-pump rate cut is the larger $0.07 one.',
    town: 'Fitchburg',
    zip: '01420',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...UNITIL, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.2987, supplyRate: 0.151 },
    heating: oilTicket({ dealer: 'Nashua River Fuel (fictional)', dealerTown: 'Fitchburg', ticketNo: '0058802' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: [],
    },
  },
  {
    id: 'cape-light-oil',
    title: 'Cape Light Compact town (Truro), oil',
    covers: 'Cape Light Compact is a Mass Save sponsor but has no published seasonal heat-pump rate, so none is applied.',
    town: 'Truro',
    zip: '02666',
    fuel: 'oil',
    installYear: 2026,
    household: { size: 2, income: 240_000 },
    quote: null,
    electric: { ...electricBase, ...EVERSOURCE, rateClass: 'R-1', history: LIGHT_USE_ALT, allInRate: 0.3049, supplyRate: 0.173, supplier: 'Cape Light Compact Basic Service' },
    heating: oilTicket({ dealer: 'Outer Cape Oil (fictional)', dealerTown: 'Truro', ticketNo: '0009956' }),
    expected: {
      verdict: 'SWITCH_BEFORE_DEC31',
      headlineCase: 'save_before_deadline',
      headlinePattern: SAVE_SWITCH,
      recommendation: 'quotes',
      choices: ALL_FOUR,
      noMassSave: false,
      tier: 'whole',
      flags: ['no_seasonal_rate'],
    },
  },
]

export function scenarioById(id: string): Scenario {
  const found = SCENARIOS.find((scenario) => scenario.id === id)
  if (!found) throw new Error(`unknown scenario ${id}`)
  return found
}

const cents = (n: number): number => Math.round(n * 100) / 100

export function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

export function electricTotals(e: ElectricFacts): { kWh: number; total: number; supply: number; delivery: number } {
  const kWh = e.history[e.history.length - 1]
  const total = cents(kWh * e.allInRate)
  const supply = cents(kWh * e.supplyRate)
  return { kWh, total, supply, delivery: cents(total - supply) }
}

export function gasTotals(g: GasFacts): { total: number; ccf: number } {
  return { total: cents(g.therms * g.allInRate), ccf: Math.round(g.therms / 1.0378) }
}

/** What the reader returns for the electric bill, in the prompt-v3 schema. */
export function electricReaderJson(s: Scenario): Record<string, unknown> {
  const e = s.electric
  const { kWh, total, supply, delivery } = electricTotals(e)
  return {
    document_type: 'electric_bill',
    utility: e.utility,
    fuel: null,
    service_zip: s.zip,
    service_town: s.town,
    quantity: kWh,
    unit: 'kWh',
    total_charge: total,
    supply_charge: supply,
    delivery_charge: delivery,
    price_per_unit: null,
    billing_period: 'month',
    period_start: addDays(e.date, -e.days - 3),
    period_end: addDays(e.date, -3),
    days: e.days,
    document_date: e.date,
    supplier_name: e.supplier,
    rate_class: e.rateClass,
    discount_line_present: e.assistance,
    read_type: 'actual',
    budget_billing: false,
    history_kind: e.historyKind,
    heat_source_hint: s.heating.kind === 'electric' ? 'this bill heats the home' : 'not stated',
    usage_history: e.history,
    degree_days: null,
    tank_size_gal: null,
    confidence: 'high',
  }
}

/** What the reader returns for the heating bill, or null when the electric bill is the heating bill. */
export function heatingReaderJson(s: Scenario): Record<string, unknown> | null {
  const h = s.heating
  if (h.kind === 'electric') return null
  if (h.kind === 'gas') {
    const { total } = gasTotals(h)
    return {
      document_type: 'gas_bill',
      utility: 'eversource',
      fuel: 'gas',
      service_zip: s.zip,
      service_town: s.town,
      quantity: h.therms,
      unit: 'therm',
      therm_factor: 1.0378,
      total_charge: total,
      price_per_unit: null,
      billing_period: 'month',
      period_start: addDays(h.date, -h.days - 3),
      period_end: addDays(h.date, -3),
      days: h.days,
      document_date: h.date,
      supplier_name: 'Basic Service',
      rate_class: h.rateClass,
      discount_line_present: h.assistance,
      read_type: 'actual',
      budget_billing: false,
      history_kind: null,
      heat_source_hint: 'this bill heats the home',
      usage_history: null,
      confidence: 'high',
    }
  }
  return {
    document_type: h.kind === 'oil' ? 'oil_delivery' : 'propane_delivery',
    utility: h.kind === 'oil' ? 'oil_dealer' : 'propane_dealer',
    fuel: h.kind,
    service_zip: s.zip,
    service_town: s.town,
    quantity: h.gallons,
    unit: 'gal',
    total_charge: cents(h.gallons * h.pricePerGal),
    price_per_unit: h.pricePerGal,
    billing_period: 'delivery',
    document_date: h.date,
    rate_class: null,
    discount_line_present: false,
    usage_history: null,
    degree_days: h.degreeDays,
    tank_size_gal: h.tankGal,
    confidence: 'high',
  }
}
