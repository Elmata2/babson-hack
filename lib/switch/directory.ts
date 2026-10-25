/**
 * @built F-122 the committed directory — a seed that cannot pretend to be a business
 * @built F-123 the list a call flow may dial, narrowed to the town it is for
 *
 * `data/providers/*.json` holds the seed and `PROVIDER_ALLOWLIST_JSON` holds the
 * deployment's own rows (R19.8). Both go through the same validator, so a row that
 * cannot carry its source and date is dropped rather than half-trusted.
 *
 * The seed is test lines on purpose: 555-0100–555-0199 is reserved for fiction, and
 * publishing a business's number we did not read from that business is the exact
 * failure R22.3 names. `data/providers/README.md` is the rule for adding real rows.
 */

import fuelSeed from '@/data/providers/fuel.json'
import installersSeed from '@/data/providers/installers.json'
import { parseProviderList, parseProviders } from './providers'
import type { SwitchProvider } from './types'

/** The committed rows, in file order, then the environment's rows. */
export function seedProviders(): SwitchProvider[] {
  return parseProviderList([...(fuelSeed as unknown[]), ...(installersSeed as unknown[])])
}

/**
 * The directory for one town. A row with no `towns` is unrestricted (a test line);
 * a row with a list is a real business narrowed to where it drives.
 */
export function directoryFor(town: string, env: NodeJS.ProcessEnv = process.env): SwitchProvider[] {
  // A deployment that names its own rows for a vertical means them: the fiction-range
  // seed would otherwise be preselected beside a real team line and dial a number that
  // cannot ring. A vertical it names nothing for keeps the seed.
  const own = parseProviders(env.PROVIDER_ALLOWLIST_JSON)
  const ownKinds = new Set(own.map((provider) => provider.kind))
  const merged = [...own, ...seedProviders().filter((provider) => !ownKinds.has(provider.kind))]
  const seen = new Set<string>()
  const rows: SwitchProvider[] = []
  for (const provider of merged) {
    if (seen.has(provider.id)) continue
    seen.add(provider.id)
    if (provider.towns && provider.towns.length > 0 && !provider.towns.some((entry) => entry === town)) continue
    rows.push(provider)
  }
  return rows
}

/** The same list, one vertical, in a stable order: fuel by id, installers by id. */
export function directoryForKind(
  kind: 'fuel' | 'installer',
  town: string,
  env: NodeJS.ProcessEnv = process.env,
): SwitchProvider[] {
  return directoryFor(town, env)
    .filter((provider) => provider.kind === kind)
    .sort((a, b) => a.id.localeCompare(b.id))
}
