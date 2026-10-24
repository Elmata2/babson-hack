/**
 * @built F-23 computeVerdict — assembles one result from a bill and an upgrade
 *
 * This is the only function the UI needs. It is pure: no clock, no network, no
 * environment. Inputs are validated first (`refusalFor`), and a refusal is a
 * `null` result plus a typed reason — the engine would rather say nothing than
 * emit a confident NaN.
 */

import {
  BASE_TEMP_F,
  BTU_PER_TON_COOLING,
  BTU_PER_UNIT_BY_FUEL,
  DEFAULT_INSTALL_COST_USD,
  DESIGN_TEMP_F_DEFAULT,
  HDD65_DEFAULT,
  HEAT_LOAN_APR,
  HEAT_LOAN_MONTHS,
  MAX_ANNUAL_UNITS_BY_FUEL,
  MAX_HDD65,
  MAX_INSTALL_COST_USD,
  MAX_PAYBACK_YEARS,
  MAX_SCOP,
  MAX_SQFT,
  MAX_TONS,
  MAX_UNIT_PRICE_USD,
  MIN_DESIGN_TEMP_F,
  SCOP_DEFAULT,
  SCOP_MAX,
  SCOP_MIN,
  UNIT_LABEL_BY_FUEL,
} from './constants'
import { annualKWh, fuelCost, monthly, operatingCost } from './cost'
import { breakEvenElectricPrice, heatLoan, payback } from './finance'
import { deliveredHeat, designLoad, isOversized, resolveAfue, sizeTons } from './heat'
import { FUEL_SNAPSHOT_2026_10_19, HEAT_PUMP_RULES_2026, isFuel, isTier, rulesForYear, TIER_LABEL } from './rules'
import { rebate } from './rebate'
import { verdictOf } from './verdict'
import type { Assumption, HeatingInput, Refusal, Tier, UpgradeInput, Verdict, VerdictResult } from './types'

const FUEL_LABEL: Record<string, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** USD with cents only below $100, per the units convention. */
function usd(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 100) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
  return `${sign}$${abs.toFixed(2)}`
}

/** A $/kWh rate as cents, the way the bill writes it. */
function cents(ratePerKWh: number): string {
  return `${(ratePerKWh * 100).toFixed(1)}¢`
}

/** One decimal place, for tons and years. */
function one(value: number): string {
  return value.toFixed(1)
}

function refuse(code: Refusal['code'], field: string, message: string): Refusal {
  return { code, field, message }
}

function tierLabelOf(tier: Tier): string {
  return TIER_LABEL[tier]
}

/**
 * Why the engine cannot answer, or `null` when it can.
 * Input: heating + upgrade inputs, exactly as `computeVerdict` receives them.
 * Guarantee: every hostile input class (unknown fuel, 2029 install year, zero or
 * billion-unit bills, non-finite rates) has a named refusal.
 */
export function refusalFor(heating: HeatingInput, upgrade: UpgradeInput): Refusal | null {
  if (!isFuel(heating.fuel)) {
    return refuse(
      'unknown_fuel',
      'fuel',
      `Cannot price "${String(heating.fuel)}": this engine only knows oil, propane, natural gas and electric resistance.`,
    )
  }
  if (!rulesForYear(upgrade.installYear)) {
    return refuse(
      'unsupported_install_year',
      'installYear',
      `No rebate table for ${String(upgrade.installYear)}. This engine only models installs in 2026 or 2027.`,
    )
  }
  if (!isTier(upgrade.tier)) {
    return refuse('missing_input', 'tier', `Unknown rebate tier "${String(upgrade.tier)}".`)
  }

  const unitLabel = UNIT_LABEL_BY_FUEL[heating.fuel]
  const maxUnits = MAX_ANNUAL_UNITS_BY_FUEL[heating.fuel]
  const units = heating.annualUnits
  if (isFiniteNumber(units) && units > maxUnits) {
    return refuse(
      'out_of_range',
      'annualUnits',
      `${units.toLocaleString('en-US')} ${unitLabel} a year is not a Massachusetts house: the ceiling is ${maxUnits.toLocaleString('en-US')}. Check the bill.`,
    )
  }
  const hasBill = isFiniteNumber(units) && units > 0
  const hasEnvelope = isFiniteNumber(heating.sqft) && heating.sqft > 0 && heating.sqft <= MAX_SQFT
  if (!hasBill && !hasEnvelope) {
    return refuse(
      'missing_input',
      'annualUnits',
      `A fuel quantity is required, or a floor area (up to ${MAX_SQFT.toLocaleString('en-US')} sqft) for the envelope fallback.`,
    )
  }
  if (!isFiniteNumber(heating.unitPrice) || heating.unitPrice <= 0 || heating.unitPrice > MAX_UNIT_PRICE_USD) {
    return refuse('out_of_range', 'unitPrice', `The fuel price must be above $0 and at most $${MAX_UNIT_PRICE_USD} per unit.`)
  }
  if (heating.afue !== undefined && resolveAfue(heating) === null) {
    return refuse('out_of_range', 'afue', 'Efficiency must be a fraction between 0 and 1 (0.80 for a typical oil boiler).')
  }
  if (heating.hdd65 !== undefined && (!isFiniteNumber(heating.hdd65) || heating.hdd65 <= 0 || heating.hdd65 > MAX_HDD65)) {
    return refuse('out_of_range', 'hdd65', 'Heating degree days must be a positive number (Boston is 5,600).')
  }
  if (
    heating.designTempF !== undefined &&
    (!isFiniteNumber(heating.designTempF) || heating.designTempF >= BASE_TEMP_F || heating.designTempF < MIN_DESIGN_TEMP_F)
  ) {
    return refuse('out_of_range', 'designTempF', 'Design temperature must be below 65°F (Boston is 7°F).')
  }
  if (!isFiniteNumber(upgrade.heatPumpRate) || upgrade.heatPumpRate <= 0 || upgrade.heatPumpRate > MAX_UNIT_PRICE_USD) {
    return refuse('out_of_range', 'heatPumpRate', 'The heat pump rate must be a positive $/kWh figure.')
  }
  if (!isFiniteNumber(upgrade.standardRate) || upgrade.standardRate <= 0 || upgrade.standardRate > MAX_UNIT_PRICE_USD) {
    return refuse('out_of_range', 'standardRate', 'The standard electric rate must be a positive $/kWh figure.')
  }
  if (upgrade.scop !== undefined && (!isFiniteNumber(upgrade.scop) || upgrade.scop <= 0 || upgrade.scop > MAX_SCOP)) {
    return refuse('out_of_range', 'scop', 'SCOP must be a positive number; air-source equipment runs 2.3–3.2 in Massachusetts.')
  }
  if (
    upgrade.installCost !== undefined &&
    (!isFiniteNumber(upgrade.installCost) || upgrade.installCost <= 0 || upgrade.installCost > MAX_INSTALL_COST_USD)
  ) {
    return refuse('out_of_range', 'installCost', `The install cost must be above $0 and at most $${MAX_INSTALL_COST_USD}.`)
  }
  if (upgrade.tons !== undefined && (!isFiniteNumber(upgrade.tons) || upgrade.tons <= 0 || upgrade.tons > MAX_TONS)) {
    return refuse('out_of_range', 'tons', 'Tonnage must be a positive number; a house is 1–10 tons.')
  }
  if (upgrade.tier === 'enhanced' && upgrade.installCost === undefined) {
    return refuse('missing_input', 'installCost', 'The enhanced tier is capped by install cost, so a quote is required.')
  }
  return null
}

/**
 * The whole verdict, from a current-fuel description and a proposed upgrade.
 * Input: HeatingInput (fuel, units, $/unit, optional AFUE/HDD/design temp/sqft) and
 * UpgradeInput (tier, install year, rates, optional tons/cost/SCOP). Output: a
 * full-precision VerdictResult, or `null` when the inputs cannot be answered
 * honestly (see `refusalFor`). Guarantee: deterministic, no NaN, at least two
 * reasons and one caveat, and every default used is listed in `assumptions`.
 */
export function computeVerdict(heating: HeatingInput, upgrade: UpgradeInput): VerdictResult | null {
  if (refusalFor(heating, upgrade)) return null

  const assumptions: Assumption[] = []
  const caveats: string[] = []

  // ---- climate assumptions -------------------------------------------------
  const hdd65 = heating.hdd65 ?? HDD65_DEFAULT
  if (heating.hdd65 === undefined) {
    assumptions.push({
      field: 'hdd65',
      value: `${hdd65.toLocaleString('en-US')} HDD65`,
      reason:
        'No town was supplied, so the Boston zone is used. Worcester runs 6,500 and Springfield 6,200 degree days, which changes the design load but not the annual cost.',
    })
    caveats.push(
      `No town supplied: ${hdd65.toLocaleString('en-US')} HDD65 and a ${DESIGN_TEMP_F_DEFAULT}°F design temperature are Boston values.`,
    )
  }
  const designTempF = heating.designTempF ?? DESIGN_TEMP_F_DEFAULT
  if (heating.designTempF === undefined) {
    assumptions.push({
      field: 'designTempF',
      value: `${designTempF}°F`,
      reason: 'The 99% heating design condition for Boston; colder inland sites need colder design temperatures.',
    })
  }

  // ---- delivered heat ------------------------------------------------------
  const delivered = deliveredHeat(heating)
  if (!delivered) return null
  assumptions.push(...delivered.assumptions)

  const afueResolved = resolveAfue(heating)
  if (!afueResolved) return null
  const afue = afueResolved.afue

  // ---- design load and tonnage --------------------------------------------
  const load = designLoad({ btu: delivered.btu, hdd65, designTempF, sqft: heating.sqft })
  if (!load) return null

  let tons: number
  if (upgrade.tons !== undefined) {
    tons = upgrade.tons
    assumptions.push({
      field: 'tons',
      value: `${tons} ton`,
      reason: 'Tonnage was supplied by the caller, so the design load is reported but not used to size the rebate.',
    })
  } else {
    const sized = sizeTons(load.btuhr)
    if (sized === null) return null
    tons = sized
    assumptions.push({
      field: 'tons',
      value: `${tons} ton`,
      reason: `Rounded from ${one(load.btuhr / BTU_PER_TON_COOLING)} tons of calculated design load to the nearest half ton, which is how equipment is sold.`,
    })
  }

  // ---- efficiency, rates, cost --------------------------------------------
  const scop = upgrade.scop ?? SCOP_DEFAULT
  if (upgrade.scop === undefined) {
    assumptions.push({
      field: 'scop',
      value: scop.toFixed(2),
      reason: `Seasonal COP default from steering. The MA field average is closer to 2.5 and nameplate ratings reach 3.2 (range ${SCOP_MIN}–${SCOP_MAX}).`,
    })
  }
  const installCost = upgrade.installCost ?? DEFAULT_INSTALL_COST_USD
  if (upgrade.installCost === undefined) {
    assumptions.push({
      field: 'installCost',
      value: usd(installCost),
      reason:
        'No quote supplied, so the Mass Save published average for a whole-home install is used. Your contractor quote is the real number.',
    })
    caveats.push(`Install cost is the Mass Save average of ${usd(installCost)}, not a quote for this house.`)
  }

  // ---- annual energy -------------------------------------------------------
  const kWh = annualKWh(delivered.btu, scop)
  if (kWh === null) return null
  const newHp = operatingCost(kWh, upgrade.heatPumpRate)
  const newStd = operatingCost(kWh, upgrade.standardRate)
  if (newHp === null || newStd === null) return null

  // A bill gives units directly; the envelope path implies them from the estimate.
  let billUnits = heating.annualUnits
  if (delivered.source === 'envelope') {
    billUnits = delivered.btu / (BTU_PER_UNIT_BY_FUEL[heating.fuel] * afue)
    assumptions.push({
      field: 'annualUnits',
      value: `${Math.round(billUnits).toLocaleString('en-US')} ${UNIT_LABEL_BY_FUEL[heating.fuel]}`,
      reason:
        'There was no usable bill: fuel quantity is implied by the floor-area heat estimate, so today’s cost is an estimate of an estimate.',
    })
    caveats.push('No bill was supplied: today’s fuel use and cost are derived from floor area, so the savings are directional.')
  }
  if (!isFiniteNumber(billUnits) || billUnits < 0) return null
  const oldCost = fuelCost(billUnits, heating.unitPrice)
  if (oldCost === null) return null

  // ---- rebates, both years, same tier and tonnage --------------------------
  const rebateOpts = {
    installCost,
    weatherizationBonus: upgrade.weatherizationBonus === true,
    sizingBonus: upgrade.sizingBonus === true,
    fuel: heating.fuel,
  }
  const r2026 = rebate(upgrade.tier, tons, 2026, rebateOpts)
  const r2027 = rebate(upgrade.tier, tons, 2027, rebateOpts)
  if (!r2026 || !r2027) return null
  // The install year decides which table pays; both are kept for the cliff.
  const activeRebate = upgrade.installYear === 2027 ? r2027 : r2026
  assumptions.push(...activeRebate.assumptions)

  const totalRebate = activeRebate.total
  const rebate2026 = r2026.total
  const rebate2027 = r2027.total
  const cliffCost = Math.max(0, rebate2026 - rebate2027)
  const netCost = installCost - totalRebate

  // ---- savings, payback, loan, break-even ----------------------------------
  const annualSavings = oldCost - newHp
  const annualSavingsAtStandardRate = oldCost - newStd
  const paybackYears = payback(netCost, annualSavings)
  const loan = heatLoan(netCost, HEAT_LOAN_MONTHS, HEAT_LOAN_APR)
  if (!loan) return null
  const monthlySavings = monthly(annualSavings)
  if (monthlySavings === null) return null
  const breakEven = breakEvenElectricPrice({ btu: delivered.btu, oldCost, scop })

  // ---- reasons -------------------------------------------------------------
  const fuelLabel = FUEL_LABEL[heating.fuel] ?? heating.fuel
  const unitLabel = UNIT_LABEL_BY_FUEL[heating.fuel]
  const tierLabel = tierLabelOf(upgrade.tier)

  const reasons: string[] = [
    `${fuelLabel} at ${usd(heating.unitPrice)}/${unitLabel} costs ${usd(oldCost)} a year. The same delivered heat at SCOP ${scop.toFixed(2)} draws ${Math.round(kWh).toLocaleString('en-US')} kWh, which is ${usd(newHp)} a year at ${cents(upgrade.heatPumpRate)}/kWh.`,
  ]

  if (activeRebate.eligible) {
    reasons.push(
      `The ${upgrade.installYear} ${tierLabel} rebate is ${usd(totalRebate)} against a ${usd(installCost)} install, so the net cost is ${usd(netCost)}.`,
    )
  } else {
    reasons.push(
      `No ${upgrade.installYear} ${tierLabel} rebate is available here, so the full ${usd(installCost)} is your cost.`,
    )
    caveats.push(activeRebate.reason ?? 'The selected rebate tier is not available for this fuel.')
  }

  const draft: VerdictResult = {
    deliveredMMBtu: delivered.mmBtu,
    designBTUhr: load.btuhr,
    tons,
    annualKWh: kWh,
    oldAnnualCost: oldCost,
    newAnnualCostStandard: newStd,
    newAnnualCostHeatPumpRate: newHp,
    annualSavings,
    annualSavingsAtHeatPumpRate: annualSavings,
    annualSavingsAtStandardRate,
    totalRebate,
    rebateBreakdown: activeRebate.breakdown,
    netCost,
    paybackYears,
    monthlyLoan: loan.monthly,
    monthlySavings,
    cashFlowPositive: monthlySavings >= loan.monthly,
    breakEvenElectricPrice: breakEven,
    rebate2026,
    rebate2027,
    cliffCost,
    verdict: 'SWITCH_NOW',
    reasons,
    caveats,
    assumptions,
    fuel: heating.fuel,
    tier: upgrade.tier,
    installYear: upgrade.installYear,
    installCost,
    scop,
    hdd65,
    designTempF,
    annualUnits: billUnits,
    unitPrice: heating.unitPrice,
    heatPumpRate: upgrade.heatPumpRate,
    standardRate: upgrade.standardRate,
    rebateEligible: activeRebate.eligible,
  }

  const verdict: Verdict = verdictOf(draft)

  if (verdict === 'SWITCH_BEFORE_DEC31') {
    reasons.push(
      `Installing in 2026 is worth ${usd(cliffCost)} more than waiting: the same ${tierLabel} rebate is ${usd(rebate2027)} for installs on or after 2027-01-01, and paperwork must reach Mass Save by ${HEAT_PUMP_RULES_2026.documentationDeadline ?? '2027-02-28'}.`,
    )
  } else if (verdict === 'SWITCH_NOW') {
    reasons.push(
      `Net cost is repaid in ${one(paybackYears ?? 0)} years, and the ${HEAT_LOAN_MONTHS}-month ${HEAT_LOAN_APR === 0 ? '0% ' : ''}HEAT Loan payment of ${usd(loan.monthly)}/mo is ${draft.cashFlowPositive ? 'below' : 'above'} the ${usd(monthlySavings)}/mo you save.`,
    )
  } else if (annualSavings <= 0) {
    reasons.push(
      `This loses ${usd(-annualSavings)} a year. Break-even for the heat pump is ${breakEven === null ? 'not computable' : cents(breakEven)}/kWh, and you are modelling ${cents(upgrade.heatPumpRate)}/kWh.`,
    )
  } else {
    reasons.push(
      `Savings of ${usd(annualSavings)} a year are real, but ${usd(netCost)} of net cost takes ${paybackYears === null ? 'longer than the limit' : `${one(paybackYears)} years`} to repay, past the ${MAX_PAYBACK_YEARS}-year limit.`,
    )
  }

  // ---- caveats: every one of these is a real weakness of the answer --------
  caveats.push(
    `Sizing is approximate: ${tons} tons comes from degree-day arithmetic on your fuel use, not from a Manual J load calculation.`,
  )
  if (isOversized(tons)) {
    caveats.push(`${tons} tons is above the residential norm; a Manual J usually finds a smaller unit and a smaller bill.`)
  }

  const snapshot = FUEL_SNAPSHOT_2026_10_19
  if (heating.fuel === 'oil') {
    caveats.push(
      `Oil is volatile: ${usd(snapshot.oil.yearAgo)}/gal a year ago, ${usd(snapshot.oil.avg)}/gal in the week of ${snapshot.asOf}. The savings move with it.`,
    )
  } else if (heating.fuel === 'propane') {
    caveats.push(
      `Propane is volatile: ${usd(snapshot.propane.yearAgo)}/gal a year ago, ${usd(snapshot.propane.avg)}/gal in the week of ${snapshot.asOf}.`,
    )
  } else {
    caveats.push(
      `Both prices are today's: electricity at ${cents(upgrade.standardRate)}/kWh (EIA ${snapshot.electricity.standardRateAsOf}) and ${fuelLabel.toLowerCase()} from your own numbers. Neither is fixed.`,
    )
  }

  if (monthlySavings > 0 && !draft.cashFlowPositive) {
    caveats.push(
      `Cash flow is negative: the loan payment of ${usd(loan.monthly)}/mo exceeds the ${usd(monthlySavings)}/mo saved until the loan is repaid at month ${HEAT_LOAN_MONTHS}. You are buying the next 15 winters, not a monthly win.`,
    )
  }
  if (upgrade.tier === 'basic') {
    caveats.push(
      'The basic tier applies where no fossil fuel or resistance heat is displaced. If this house is heated by oil, use the whole-home tier instead.',
    )
  }
  if (upgrade.tier === 'enhanced' && activeRebate.eligible) {
    caveats.push(
      'The enhanced tier is income-qualified. Thresholds are not published: call 888-714-3990 and let a Home Energy Assessment decide. This is an estimate, not a determination.',
    )
  }
  caveats.push('Estimate only. Not a quote. A Home Energy Assessment determines eligibility and sizing.')

  const seen = new Set<string>()
  const uniqueAssumptions = assumptions.filter((a) => {
    const key = `${a.field}|${a.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { ...draft, verdict, reasons, caveats, assumptions: uniqueAssumptions }
}
