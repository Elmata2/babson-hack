/**
 * @built F-143 choicesFor — R17.2, a pure function of verdict, fuel and utility
 *
 * Which choices appear is not a design decision made per screen: it is arithmetic
 * over three facts. Oil and propane have dealers to shop; gas and electricity do
 * not. Supply can only be shopped where an investor-owned utility (or Cape Light
 * Compact) delivers; a municipal light plant supplies and delivers, so there is no
 * supply choice. A heat pump is always on the table.
 *
 * Nothing here is preselected. The screen renders `STAY` with the same weight and
 * only reveals a panel when the household picks one.
 */

import type { Fuel, Verdict } from '../calc/types'
import type { BillUtility } from '../parse/contract'
import type { UtilityResolution } from '../utility'
import type { SwitchChoice } from './types'

/** The three investor-owned utilities whose customers can choose a supplier. */
const INVESTOR_OWNED: readonly BillUtility[] = ['eversource', 'national_grid', 'unitil']

export interface ChoiceContext {
  /** `null` when the verdict could not be computed. */
  verdict: Verdict | null
  fuel: Fuel | null
  utility: UtilityResolution | null
  /**
   * What the household's own bill says sent it. A municipal sender settles a mixed
   * town without asking; an investor-owned sender answers it the other way.
   */
  billUtility?: BillUtility | null
}

/**
 * True only when a supply choice genuinely exists at this address.
 * Guarantee: false for a municipal light plant town, false when the sponsor is
 * unknown or mixed and no bill settles it — never a guess in either direction.
 */
export function supplyChoiceAvailable({ utility, billUtility = null }: ChoiceContext): boolean {
  if (billUtility === 'municipal') return false
  if (billUtility !== null && INVESTOR_OWNED.includes(billUtility)) return true
  if (billUtility !== null && !INVESTOR_OWNED.includes(billUtility) && billUtility !== 'other') {
    // A heating-oil, propane or gas sender says nothing about the electric sponsor.
    // Fall through to the town table rather than guessing from an unrelated bill.
  }
  if (!utility || !utility.found) return false
  if (utility.eligibleForMassSave === false) return false
  if (utility.hasMunicipal) return false
  if (utility.mixed) return false
  return utility.sponsors.some(
    (sponsor) =>
      sponsor === 'eversource' || sponsor === 'nationalgrid' || sponsor === 'unitil' || sponsor === 'cape_light',
  )
}

/**
 * R17.2: the four choices that may appear, in the requirement's order.
 * Guarantee: `SWITCH_HEAT_PUMP` always; `SHOP_FUEL` only for oil and propane;
 * `SHOP_SUPPLY` only where supply can actually be chosen.
 */
export function choicesFor(context: ChoiceContext): SwitchChoice[] {
  const choices: SwitchChoice[] = ['STAY']
  if (context.fuel === 'oil' || context.fuel === 'propane') choices.push('SHOP_FUEL')
  if (supplyChoiceAvailable(context)) choices.push('SHOP_SUPPLY')
  choices.push('SWITCH_HEAT_PUMP')
  return choices
}

/** Display copy for the gate. Words only; every number comes from the props. */
export const CHOICE_COPY: Record<
  SwitchChoice,
  { label: string; action: string; detail: string; kind: 'stay' | 'fuel' | 'supply' | 'installer' }
> = {
  STAY: {
    label: 'Stay as you are',
    action: 'Keep what you have',
    detail: 'Nothing is sent, and nothing changes. We show what would change the answer.',
    kind: 'stay',
  },
  SHOP_FUEL: {
    label: 'Shop heating fuel',
    action: 'Compare dealer prices',
    detail: 'A dealer price is a phone call, not a published number. You see the exact sentence first.',
    kind: 'fuel',
  },
  SHOP_SUPPLY: {
    label: 'Shop electricity supply',
    action: 'Compare published supply',
    detail: 'Supply offers are published already, so no call is placed. We show the rates and the links.',
    kind: 'supply',
  },
  SWITCH_HEAT_PUMP: {
    label: 'Get heat pump quotes',
    action: 'Ask installers for a ballpark',
    detail: 'The rebate step-down on 1 January is the deadline. You approve who is contacted and what is said.',
    kind: 'installer',
  },
}

/** The choice mapped to the kind the request payload and the store use. */
export function kindOf(choice: SwitchChoice): 'stay' | 'fuel' | 'supply' | 'installer' {
  return CHOICE_COPY[choice].kind
}
