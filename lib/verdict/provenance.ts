/**
 * @built F-36 provenance drawer — the formula, the substituted values, the source and its date
 *
 * R9 asks for a provenance entry behind every displayed figure. The rule that
 * makes that honest is subtraction: this module may only *re-state* what
 * `lib/calc` returned and what the caller passed in. It never derives a new
 * number, so the drawer can disagree with the engine but it cannot invent a fact.
 *
 * The caller (`app/verdict/page.tsx`) supplies the source references because only
 * it knows whether a price came from EIA, the household's bill, or the dated
 * snapshot. Source names and dates live there; the arithmetic lives here.
 */

import {
  AFUE_BY_FUEL,
  BTU_PER_KWH,
  BTU_PER_UNIT_BY_FUEL,
  HEAT_LOAN_MONTHS,
  MAX_PAYBACK_YEARS,
} from '../calc/constants'
import type { VerdictResult } from '../calc/types'
import { TIER_LABEL } from '../calc/rules'
import { cents, count, one, usd } from './format'

/** Where one figure came from, named the way R9.2 asks: publisher, document, date. */
export interface SourceRef {
  publisher: string
  document: string
  /** The day the source published the number, or `as billed` for a household document. */
  asOf: string
}

/** One value substituted into a formula, shown with its label. */
export interface Substitution {
  label: string
  value: string
}

/** Everything the drawer shows for one figure. */
export interface ProvenanceEntry {
  id: FigureId
  /** What the figure is, in the screen's own words. */
  label: string
  /** The figure exactly as the screen prints it. */
  value: string
  formula: string
  substitutes: Substitution[]
  source: SourceRef
  /** A limitation the reader needs to weigh the number. */
  note?: string
}

/** Every figure the verdict screen lets a reader click. */
export type FigureId =
  | 'hdd'
  | 'fuelUse'
  | 'deliveredHeat'
  | 'designLoad'
  | 'tons'
  | 'scop'
  | 'annualKWh'
  | 'oldCost'
  | 'newCostSeasonal'
  | 'newCostStandard'
  | 'savings'
  | 'rebate'
  | 'netCost'
  | 'payback'
  | 'monthlyLoan'
  | 'monthlySavings'
  | 'breakEven'
  | 'cliff'

/** The sources the page already resolved; nothing here is looked up. */
export interface ProvenanceContext {
  fuelSource: SourceRef
  electricitySource: SourceRef
  heatPumpRateSource: SourceRef
  climateSource: SourceRef
  rebateSource: SourceRef
  installCostSource: SourceRef
  equipmentSource: SourceRef
  /** The bill's own note, when a document was read (F-106). */
  billNote?: string | null
}

const UNIT_LABEL: Record<VerdictResult['fuel'], string> = {
  oil: 'gal',
  propane: 'gal',
  gas: 'therms',
  resistance: 'kWh',
}

const FUEL_LABEL: Record<VerdictResult['fuel'], string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

const BTU_PER_UNIT = BTU_PER_UNIT_BY_FUEL

/** Build the whole drawer, in reading order. Pure; no clock, no network. */
export function provenanceFor(result: VerdictResult, ctx: ProvenanceContext): ProvenanceEntry[] {
  const unit = UNIT_LABEL[result.fuel]
  const afue = AFUE_BY_FUEL[result.fuel]
  const payback =
    result.paybackYears === null
      ? 'none'
      : `${one(result.paybackYears)} yr${result.paybackYears > MAX_PAYBACK_YEARS ? ' — past the limit' : ''}`

  return [
    {
      id: 'hdd',
      label: 'Heating degree days',
      value: `${count(result.hdd65)} HDD65`,
      formula: 'HDD65 = Σ max(65 − daily mean °F, 0), summed per year and averaged 2015–2024',
      substitutes: [
        { label: 'Base temperature', value: '65 °F' },
        { label: 'Years', value: '2015–2024' },
      ],
      source: ctx.climateSource,
      note: 'A county-centroid grid cell, not a measurement at this house. A Manual J is the only sizing authority.',
    },
    {
      id: 'fuelUse',
      label: `Yearly ${result.fuel === 'resistance' ? 'electricity' : 'fuel'} use`,
      value: `${count(result.annualUnits)} ${unit}`,
      formula: `delivered heat = units × BTU per ${unit} × AFUE ÷ 1,000,000`,
      substitutes: [
        { label: 'Units a year', value: `${count(result.annualUnits)} ${unit}` },
        { label: 'BTU per unit', value: `${count(BTU_PER_UNIT[result.fuel])} BTU` },
        { label: 'AFUE', value: afue.toFixed(2) },
      ],
      source: ctx.fuelSource,
      note: ctx.billNote ?? undefined,
    },
    {
      id: 'deliveredHeat',
      label: 'Delivered heat',
      value: `${one(result.deliveredMMBtu)} MMBtu`,
      formula: 'delivered heat = units × BTU per unit × AFUE ÷ 1,000,000',
      substitutes: [
        { label: `${FUEL_LABEL[result.fuel]} a year`, value: `${count(result.annualUnits)} ${unit}` },
        { label: 'BTU per unit', value: `${count(BTU_PER_UNIT[result.fuel])} BTU` },
        { label: 'AFUE', value: afue.toFixed(2) },
      ],
      source: ctx.fuelSource,
    },
    {
      id: 'designLoad',
      label: 'Design load',
      value: `${count(result.designBTUhr)} BTU/hr`,
      formula: 'UA = delivered BTU ÷ (24 × HDD65); design load = UA × (65 − design temperature)',
      substitutes: [
        { label: 'Delivered heat', value: `${count(result.deliveredMMBtu * 1_000_000)} BTU` },
        { label: 'HDD65', value: count(result.hdd65) },
        { label: 'Design temperature', value: `${result.designTempF} °F` },
      ],
      source: ctx.climateSource,
    },
    {
      id: 'tons',
      label: 'System size',
      value: `${one(result.tons)} tons`,
      formula: 'tons = round to the nearest 0.5 (design BTU/hr ÷ 12,000)',
      substitutes: [
        { label: 'Design load', value: `${count(result.designBTUhr)} BTU/hr` },
        { label: 'BTU per ton', value: '12,000' },
      ],
      source: ctx.equipmentSource,
      note: 'Mass Save pays on AHRI cooling capacity; confirm tonnage against the equipment submittal.',
    },
    {
      id: 'scop',
      label: 'Seasonal performance',
      value: `SCOP ${result.scop.toFixed(2)}`,
      formula: 'annual kWh = delivered BTU ÷ (3,412.14 BTU/kWh × SCOP)',
      substitutes: [
        { label: 'BTU per kWh', value: `${BTU_PER_KWH}` },
        { label: 'SCOP', value: result.scop.toFixed(2) },
      ],
      source: ctx.equipmentSource,
      note: 'Seasonal COP for Massachusetts air-source equipment; a cold-climate model or a different house moves it.',
    },
    {
      id: 'annualKWh',
      label: 'Electricity a year',
      value: `${count(result.annualKWh)} kWh`,
      formula: 'annual kWh = delivered BTU ÷ (3,412.14 BTU/kWh × SCOP)',
      substitutes: [
        { label: 'Delivered heat', value: `${count(result.deliveredMMBtu * 1_000_000)} BTU` },
        { label: 'BTU per kWh', value: `${BTU_PER_KWH}` },
        { label: 'SCOP', value: result.scop.toFixed(2) },
      ],
      source: ctx.equipmentSource,
    },
    {
      id: 'oldCost',
      label: 'What you pay now',
      value: usd(result.oldAnnualCost),
      formula: `old cost = ${unit} a year × price per ${unit}`,
      substitutes: [
        { label: `${FUEL_LABEL[result.fuel]} a year`, value: `${count(result.annualUnits)} ${unit}` },
        { label: `Price per ${unit}`, value: `$${result.unitPrice.toFixed(result.unitPrice < 1 ? 3 : 2)}` },
      ],
      source: ctx.fuelSource,
    },
    {
      id: 'newCostSeasonal',
      label: 'Heat pump, seasonal rate',
      value: usd(result.newAnnualCostHeatPumpRate),
      formula: 'new cost = annual kWh × seasonal heat-pump rate',
      substitutes: [
        { label: 'Annual kWh', value: count(result.annualKWh) },
        { label: 'Seasonal rate', value: `${cents(result.heatPumpRate)}/kWh` },
      ],
      source: ctx.heatPumpRateSource,
      note: 'Nov 1 – Apr 30. The rate a heat-pump customer is eligible for; it is not the year-round rate.',
    },
    {
      id: 'newCostStandard',
      label: 'Heat pump, standard rate',
      value: usd(result.newAnnualCostStandard),
      formula: 'new cost = annual kWh × standard all-in rate',
      substitutes: [
        { label: 'Annual kWh', value: count(result.annualKWh) },
        { label: 'Standard rate', value: `${cents(result.standardRate)}/kWh` },
      ],
      source: ctx.electricitySource,
      note: 'The conservative view: the same heat at the price you pay all year.',
    },
    {
      id: 'savings',
      label: 'Annual savings',
      value: usd(result.annualSavings),
      formula: 'savings = old cost − new cost at the seasonal rate',
      substitutes: [
        { label: 'Old annual cost', value: usd(result.oldAnnualCost) },
        { label: 'New annual cost, seasonal', value: usd(result.newAnnualCostHeatPumpRate) },
      ],
      source: ctx.fuelSource,
      note:
        result.annualSavingsAtStandardRate <= 0 && result.annualSavings > 0
          ? `At the standard rate the same heat costs ${usd(-result.annualSavingsAtStandardRate)} more, not less.`
          : undefined,
    },
    {
      id: 'rebate',
      label: `Rebate, ${result.installYear} ${TIER_LABEL[result.tier]} install`,
      value: usd(result.totalRebate),
      formula: 'rebate = Σ line items, with the tier cap applied after bonuses',
      substitutes: result.rebateBreakdown.length
        ? result.rebateBreakdown.map((line) => ({ label: line.label, value: usd(line.amount) }))
        : [{ label: 'Eligible line items', value: 'none — this tier is not available here' }],
      source: ctx.rebateSource,
      note: result.rebateEligible
        ? 'Estimate, not a quote. A Home Energy Assessment determines eligibility.'
        : 'No rebate is modelled for this tier and fuel; the full install cost is yours.',
    },
    {
      id: 'netCost',
      label: 'Net cost after rebate',
      value: usd(result.netCost),
      formula: 'net cost = install cost − rebate',
      substitutes: [
        { label: 'Install cost', value: usd(result.installCost) },
        { label: 'Rebate', value: usd(result.totalRebate) },
      ],
      source: ctx.installCostSource,
      note: 'The install cost is the Mass Save program average, not a quote for this house.',
    },
    {
      id: 'payback',
      label: 'Payback',
      value: payback,
      formula: 'payback = net cost ÷ annual savings; no payback exists when savings ≤ 0',
      substitutes: [
        { label: 'Net cost', value: usd(result.netCost) },
        { label: 'Annual savings', value: usd(result.annualSavings) },
        { label: 'Limit beyond which the answer is "not yet"', value: `${MAX_PAYBACK_YEARS} years` },
      ],
      source: ctx.installCostSource,
      note: 'Simple and undiscounted: it ignores the time value of money and every repair after year one.',
    },
    {
      id: 'monthlyLoan',
      label: '0% HEAT Loan payment',
      value: `${usd(result.monthlyLoan)}/mo`,
      formula: `monthly loan = net cost ÷ ${HEAT_LOAN_MONTHS} months at 0%`,
      substitutes: [
        { label: 'Net cost', value: usd(result.netCost) },
        { label: 'Term', value: `${HEAT_LOAN_MONTHS} months` },
        { label: 'APR', value: '0%' },
      ],
      source: ctx.installCostSource,
    },
    {
      id: 'monthlySavings',
      label: 'Monthly savings',
      value: `${usd(result.monthlySavings)}/mo`,
      formula: 'monthly savings = annual savings ÷ 12',
      substitutes: [
        { label: 'Annual savings', value: usd(result.annualSavings) },
        { label: 'Months a year', value: '12' },
      ],
      source: ctx.fuelSource,
    },
    {
      id: 'breakEven',
      label: 'Break-even electricity price',
      value: result.breakEvenElectricPrice === null ? 'not computable' : `${cents(result.breakEvenElectricPrice)}/kWh`,
      formula: 'break-even $/kWh = old annual cost ÷ annual kWh',
      substitutes: [
        { label: 'Old annual cost', value: usd(result.oldAnnualCost) },
        { label: 'Annual kWh', value: count(result.annualKWh) },
      ],
      source: ctx.fuelSource,
      note: 'Above this price the heat pump costs more to run than the fuel it replaces.',
    },
    {
      id: 'cliff',
      label: 'Cost of waiting for 1 January',
      value: usd(result.cliffCost),
      formula: 'cliff = rebate for a 2026 install − rebate for a 2027 install',
      substitutes: [
        { label: '2026 rebate', value: usd(result.rebate2026) },
        { label: '2027 rebate', value: usd(result.rebate2027) },
      ],
      source: ctx.rebateSource,
      note: 'Both years use the same tier and tonnage, so the difference is the program step-down, not this house.',
    },
  ]
}

/** Look one entry up for a figure, or `null` when it has no entry (a bug, not a silence). */
export function entryFor(entries: readonly ProvenanceEntry[], id: FigureId): ProvenanceEntry | null {
  return entries.find((entry) => entry.id === id) ?? null
}
