'use client'

/**
 * @built F-74 profile store: localStorage, SSR-safe, validated on read
 */

import { useCallback, useEffect, useState } from 'react'
import { EMPTY_PROFILE, type Profile } from './types'

export const PROFILE_KEY = 'switchpoint.profile.v1'

const SPONSORS = ['eversource', 'nationalgrid', 'unitil', 'cape_light', 'municipal', 'other']
const FUELS = ['oil', 'propane', 'gas', 'resistance', 'heat_pump']
const HOMES = ['single', 'two_to_four', 'condo']
const SUPPLIES = ['basic', 'aggregation', 'competitive', 'unsure']
const YN = ['yes', 'no']
const YNU = ['yes', 'no', 'unsure']

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const oneOf = (v: unknown, list: string[]) => isStr(v) && list.includes(v)

/** Merge stored data over EMPTY_PROFILE, keeping only fields of the right type. */
export function sanitizeProfile(raw: unknown): Profile {
  const out: Profile = { ...EMPTY_PROFILE }
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if (isStr(r.address)) out.address = r.address
  if (isStr(r.town)) out.town = r.town
  if (oneOf(r.utility, SPONSORS)) out.utility = r.utility as Profile['utility']
  if (oneOf(r.fuel, FUELS)) out.fuel = r.fuel as Profile['fuel']
  if (oneOf(r.home, HOMES)) out.home = r.home as Profile['home']
  if (isNum(r.kwh) && r.kwh >= 0) out.kwh = r.kwh
  if (typeof r.kwhIsExample === 'boolean') out.kwhIsExample = r.kwhIsExample
  if (oneOf(r.supply, SUPPLIES)) out.supply = r.supply as Profile['supply']
  if (isNum(r.supplierRateCents) && r.supplierRateCents >= 0) out.supplierRateCents = r.supplierRateCents
  if (isStr(r.contractEnd) && /^\d{4}-\d{2}-\d{2}$/.test(r.contractEnd)) out.contractEnd = r.contractEnd
  if (isNum(r.terminationFeeUsd) && r.terminationFeeUsd >= 0) out.terminationFeeUsd = r.terminationFeeUsd
  if (oneOf(r.solar, YN)) out.solar = r.solar as Profile['solar']
  if (oneOf(r.ev, YN)) out.ev = r.ev as Profile['ev']
  if (oneOf(r.incomeEligible, YNU)) out.incomeEligible = r.incomeEligible as Profile['incomeEligible']
  return out
}

/** True when nothing differs from EMPTY_PROFILE: storage should hold no entry at all. */
export function isEmptyProfile(profile: Profile): boolean {
  return (Object.keys(EMPTY_PROFILE) as Array<keyof Profile>).every((k) => profile[k] === EMPTY_PROFILE[k])
}

function read(): Profile {
  try {
    const text = window.localStorage.getItem(PROFILE_KEY)
    return text ? sanitizeProfile(JSON.parse(text)) : { ...EMPTY_PROFILE }
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

function write(profile: Profile): void {
  try {
    if (isEmptyProfile(profile)) window.localStorage.removeItem(PROFILE_KEY)
    else window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Storage blocked or full: the profile still works for this session.
  }
}

export function useProfile(): { profile: Profile; update: (patch: Partial<Profile>) => void; clear: () => void } {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Reading localStorage is the external-system sync this effect exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(read())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) write(profile)
  }, [profile, hydrated])

  const update = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch }
      if ('kwh' in patch && !('kwhIsExample' in patch)) next.kwhIsExample = false
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setProfile({ ...EMPTY_PROFILE })
    try {
      window.localStorage.removeItem(PROFILE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { profile, update, clear }
}
