import type { SwitchModel } from './model'
import type { OptionInput } from './option-cards'
import type { SwitchProvider } from './types'

export type OutreachMode = 'off' | 'allowlist' | 'live'

export function reachableBy(provider: SwitchProvider, kind: SwitchProvider['kind'], mode: OutreachMode): boolean {
  if (provider.kind !== kind || mode === 'off') return false
  if (mode === 'allowlist') return provider.allowlist
  return !provider.allowlist && provider.channels.includes('email') && provider.email !== null
}

export function buildOptionInput(
  model: SwitchModel,
  providers: readonly SwitchProvider[],
  plan: { mode: OutreachMode },
): OptionInput | null {
  if (!model.result) return null
  return {
    result: model.result,
    fuel: model.fuel,
    unitPrice: model.unitPrice,
    annualUnits: model.annualUnits,
    market: { price: model.market.price, period: model.market.period },
    basic: model.supply.basic
      ? {
          centsPerKwh: model.supply.basic.centsPerKwh,
          source: model.supply.basic.source,
          sourceDate: model.supply.basic.sourceDate,
        }
      : null,
    noMassSave: model.noMassSave,
    plan,
    reachable: {
      fuel: providers.filter((provider) => reachableBy(provider, 'fuel', plan.mode)).length,
      installer: providers.filter((provider) => reachableBy(provider, 'installer', plan.mode)).length,
    },
  }
}
