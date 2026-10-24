import { normalizePlaceName } from '../address/nominatim'
import { displayTown } from '../geo'
import { lookupZip } from '../map/zip'

export type TownFromAddress =
  | { kind: 'matched'; town: string; via: 'name' | 'zip' }
  | { kind: 'ambiguous'; candidates: readonly string[] }
  | { kind: 'none' }

const NONE: TownFromAddress = { kind: 'none' }
const ZIP = /\b(\d{5})(?:-\d{4})?\b/g
const OTHER_STATES = new Set(
  'al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'.split(' '),
)
const STATE_NAMES = /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|west virginia|wisconsin|wyoming)\b/i
const MA_ZIP_PREFIXES = new Set(['055', ...Array.from({ length: 18 }, (_, index) => `0${10 + index}`)])
const STATE_WORDS = /\b(?:ma|mass|massachusetts)\b/g

function exactSegmentTown(text: string, byName: ReadonlyMap<string, string>): string | null {
  for (const segment of text.split(',').reverse()) {
    const cleaned = normalizePlaceName(segment.toLowerCase().replace(STATE_WORDS, ' ').replace(/\d+(?:-\d{4})?/g, ' '))
    if (cleaned === '') continue
    return byName.get(cleaned) ?? null
  }
  return null
}

function zipTown(text: string, byName: ReadonlyMap<string, string>): string | null {
  const zips = [...text.matchAll(ZIP)].map((match) => match[1])
  for (const zip of zips.reverse()) {
    const hit = lookupZip(zip)
    const town = hit ? byName.get(normalizePlaceName(displayTown(hit.town))) : undefined
    if (town) return town
  }
  return null
}

function namesInText(text: string, towns: readonly string[]): string[] {
  const haystack = ` ${normalizePlaceName(text.replace(/,/g, ' '))} `
  const found = towns.filter((town) => haystack.includes(` ${normalizePlaceName(town)} `))
  return found.filter(
    (town) => !found.some((other) => other !== town && normalizePlaceName(other).includes(normalizePlaceName(town))),
  )
}

function namesOtherState(text: string): boolean {
  if (STATE_NAMES.test(text)) return true
  const lastSegment = /^\s*([a-z]{2})\b\s*(?:\d{5}(?:-\d{4})?)?\s*$/i
  if (text.split(',').slice(1).some((segment) => OTHER_STATES.has(lastSegment.exec(segment)?.[1]?.toLowerCase() ?? ''))) return true
  for (const match of text.matchAll(/\b([a-z]{2})\s+\d{5}(?:-\d{4})?\b/gi)) {
    if (OTHER_STATES.has(match[1].toLowerCase())) return true
  }
  const trailing = /\b([A-Z]{2})\s*$/.exec(text.trim())
  return trailing !== null && OTHER_STATES.has(trailing[1].toLowerCase())
}

function hasOutOfStateZip(text: string): boolean {
  return [...text.matchAll(ZIP)].some((match) => !MA_ZIP_PREFIXES.has(match[1].slice(0, 3)))
}

/**
 * The Massachusetts town an address names: the last comma segment if it is a town, else the ZIP's town,
 * else a single town name found in the text. Several names with no ZIP to settle it is ambiguous.
 */
export function townFromAddress(text: string, towns: readonly string[]): TownFromAddress {
  if (text.trim().length < 3 || namesOtherState(text) || hasOutOfStateZip(text)) return NONE
  const byName = new Map(towns.map((town) => [normalizePlaceName(town), town]))
  const segment = exactSegmentTown(text, byName)
  if (segment) return { kind: 'matched', town: segment, via: 'name' }
  const zip = zipTown(text, byName)
  if (zip) return { kind: 'matched', town: zip, via: 'zip' }
  const named = namesInText(text, towns)
  if (named.length === 1) return { kind: 'matched', town: named[0], via: 'name' }
  if (named.length > 1) return { kind: 'ambiguous', candidates: named }
  return NONE
}

export function townAddressReason(result: TownFromAddress): string {
  if (result.kind === 'ambiguous') return `That could be ${result.candidates.join(' or ')}. Pick your town.`
  return 'We could not find a Massachusetts town in that address. Pick your town.'
}
