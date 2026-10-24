/**
 * @built F-104 parcel guard — an assessor record only prefills when it is this house
 *
 * Why: an exact-point lookup for "12 Adams St" once returned "34 Adams ST", a
 * tax-exempt use code 985, and the form prefilled it with an "Assessor" badge.
 * The house-number check used to run on buffered matches only. It now runs on
 * every match, and the use code must be a home.
 *
 * Pure: no network, no clock.
 */

export interface GuardParcel {
  yearBuilt: number | null
  bldAreaSqft: number | null
  siteAddr?: string | null
  useCode?: string | null
  units?: number | null
}

export type ParcelVerdict =
  | {
      use: true
      yearBuilt: number | null
      /** Sqft to prefill: whole building, or one unit's share when units > 1. */
      sqft: number | null
      /** Whole-building sqft as the assessor printed it. */
      buildingSqft: number | null
      units: number
      /** True when `sqft` is a building total divided by units — an assumption. */
      sqftIsPerUnitEstimate: boolean
      unitsNote: string | null
    }
  | { use: false; reason: 'wrong_house' | 'not_a_home'; message: string }

/** `106 CHANDLER ST` → `106`. `null` when the line starts with no number. */
export function houseNumberOf(line: string): string | null {
  const match = /^\s*(\d+[A-Za-z-]?)\b/.exec(line)
  return match?.[1]?.toUpperCase() ?? null
}

/**
 * MA DOR use codes: 101–109 and 111–112 are residential (single family,
 * condo, multi-family, etc.); 013 and 031 are mixed use with a home in it.
 * 9xx exempt, 3xx commercial, 4xx industrial, and everything else is refused.
 * Codes can carry a 4th digit (e.g. 1010), so only the first three count.
 */
export function isResidentialUseCode(code: string | null | undefined): boolean {
  if (!code) return true // unknown is not evidence against; the house number still gates
  const trimmed = code.trim()
  // Some assessors publish their own letter codes (Boston: R1, R3, CD, A) rather
  // than the DOR numbers. We cannot read them, so they don't count against the house.
  if (!/^\d+$/.test(trimmed)) return true
  // Four-digit DOR codes carry a suffix ("1010") or a leading zero ("0101").
  const three = trimmed.length === 4 && trimmed.startsWith('0') ? trimmed.slice(1) : trimmed.slice(0, 3)
  // 012–019: mixed use, primarily residential. 031: primarily commercial with homes.
  if (/^01[2-9]$/.test(three) || three === '031') return true
  const n = Number(three)
  return (n >= 101 && n <= 109) || n === 111 || n === 112
}

export function judgeParcel(input: { expectedHouse: string | null; parcel: GuardParcel }): ParcelVerdict {
  const { expectedHouse, parcel } = input
  const parcelHouse = houseNumberOf(parcel.siteAddr ?? '')
  if (!expectedHouse || !parcelHouse || parcelHouse !== expectedHouse.toUpperCase()) {
    return {
      use: false,
      reason: 'wrong_house',
      message: "The assessor record at this point is for a different address — enter the basics yourself.",
    }
  }
  if (!isResidentialUseCode(parcel.useCode)) {
    return {
      use: false,
      reason: 'not_a_home',
      message: "The assessor record at this point isn't a home — enter the basics yourself.",
    }
  }

  const units = parcel.units && parcel.units > 1 ? Math.round(parcel.units) : 1
  const building = parcel.bldAreaSqft
  const split = units > 1 && building !== null
  return {
    use: true,
    yearBuilt: parcel.yearBuilt,
    sqft: split ? Math.round(building / units) : building,
    buildingSqft: building,
    units,
    sqftIsPerUnitEstimate: split,
    unitsNote: units > 1 ? `This building has ${units} units — size for your unit.` : null,
  }
}
