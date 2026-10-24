import type { VerdictResult } from '../calc/types'
import { cents, usd } from './format'
import type { Part } from './headline'

/**
 * The running-cost comparison a refusal screen can still give: the engine's old
 * annual cost against the heat pump's at the household's own bill rate, no rebate,
 * no seasonal adjustment. `null` when the bill carried no rate, because the only
 * other rate is a statewide average and a light plant sets its own.
 */
export function refusalRunningCost(
  result: VerdictResult,
  billRate: number | null,
  billIsMunicipal: boolean,
): Part[] | null {
  if (billRate === null) return null
  const rateName = billIsMunicipal ? 'your light plant’s rate' : 'the electricity rate'
  return [
    `At ${rateName} from your bill (${cents(billRate)} per kWh), no rebate: heating costs `,
    { id: 'oldCost', text: usd(result.oldAnnualCost) },
    ' a year now. The same heat from a heat pump costs ',
    { id: 'newCostStandard', text: usd(result.newAnnualCostStandard) },
    ' a year.',
  ]
}
