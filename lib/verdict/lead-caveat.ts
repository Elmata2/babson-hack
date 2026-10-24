export const INSTALL_COST_CAVEAT_PREFIX = 'Install cost is the Mass Save average'

/**
 * The caveat the verdict leads with. Where there is no Mass Save rebate the
 * average install cost is not what could change the answer, so it yields to
 * the next caveat.
 */
export function leadCaveat(caveats: readonly string[], noMassSave: boolean): string | null {
  const pick = noMassSave ? caveats.find((c) => !c.startsWith(INSTALL_COST_CAVEAT_PREFIX)) : undefined
  return pick ?? caveats[0] ?? null
}
