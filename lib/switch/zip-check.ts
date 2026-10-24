/**
 * @built F-151 the ZIP check on the consent screen
 *
 * A ZCTA is not an address and does not always belong to the town in the URL. The
 * check is pure: it says which town the ZIP resolves to, whether that is a change,
 * and the sentence to show when it is not a Massachusetts ZIP.
 */

import { displayTown } from '../geo'
import { isZip, lookupZip } from '../map/zip'

export type ZipCheck =
  | { ok: true; zip: string; town: string; differs: boolean }
  | { ok: false; error: string }

export function checkZip(raw: string, currentTown: string): ZipCheck {
  const value = raw.trim()
  if (!isZip(value)) return { ok: false, error: 'A ZIP is five digits, for example 02474.' }
  const hit = lookupZip(value)
  if (!hit) {
    return { ok: false, error: 'That ZIP is not in the Massachusetts table. Check it against your bill.' }
  }
  const town = displayTown(hit.town)
  return { ok: true, zip: value, town, differs: town.toLowerCase() !== currentTown.trim().toLowerCase() }
}
