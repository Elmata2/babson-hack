/**
 * Parses the verdict's hand-off to /map: `?town=&next=1&fuel=&save=&back=`.
 * Every param is optional and untrusted; anything off is dropped, never repaired.
 */

import type { HeatingFuel } from '@/components/map/types'
import { parseBillUtility } from '@/lib/intake/params'

export interface NextStepsQuery {
  town: string | null
  next: boolean
  fuel: HeatingFuel | null
  /** Signed whole USD per year: positive saves, negative costs. */
  saveUsd: number | null
  /** Same-origin path under /verdict, or null. */
  back: string | null
}

const FUELS: readonly HeatingFuel[] = ['oil', 'propane', 'gas', 'resistance', 'heat_pump']
const TOWN = /^[A-Za-z][A-Za-z .'’-]{0,58}$/
const SAVE = /^-?\d{1,7}$/
const BACK_MAX = 500
const ORIGIN = 'http://same-origin.invalid'

interface ParamSource {
  get(name: string): string | null
}

/** A relative /verdict path (with its query and hash), or null for anything else. */
export function safeBackPath(raw: string | null): string | null {
  if (raw === null || raw.length > BACK_MAX) return null
  if (/[\u0000-\u001f\u007f\\\s]/.test(raw)) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  let url: URL
  try {
    url = new URL(raw, ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== ORIGIN) return null
  if (url.pathname !== '/verdict' && !url.pathname.startsWith('/verdict/')) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function parseNextStepsQuery(params: ParamSource): NextStepsQuery {
  const town = params.get('town')?.trim() ?? ''
  const fuel = params.get('fuel')
  const save = params.get('save')?.trim() ?? ''
  return {
    town: TOWN.test(town) ? town : null,
    next: params.get('next') === '1',
    fuel: FUELS.find((f) => f === fuel) ?? null,
    saveUsd: SAVE.test(save) ? Number(save) : null,
    back: safeBackPath(params.get('back')),
  }
}

export type VerdictFuel = 'oil' | 'propane' | 'gas' | 'resistance'
export type VerdictBillUtility = 'eversource' | 'national_grid' | 'unitil' | 'municipal'
export type VerdictTier = 'whole' | 'partial' | 'basic' | 'enhanced'

export interface VerdictFacts {
  fuel: VerdictFuel | null
  billUtility: VerdictBillUtility | null
  tier: VerdictTier | null
  unitPrice: number | null
}

const VERDICT_FUELS: readonly VerdictFuel[] = ['oil', 'propane', 'gas', 'resistance']
const BILL_UTILITIES: readonly VerdictBillUtility[] = ['eversource', 'national_grid', 'unitil', 'municipal']
const TIERS: readonly VerdictTier[] = ['whole', 'partial', 'basic', 'enhanced']

function narrowSender(utility: string | null): VerdictBillUtility | null {
  return BILL_UTILITIES.find((u) => u === utility) ?? null
}

function backParams(back: string | null): URLSearchParams | null {
  return back === null ? null : new URL(back, ORIGIN).searchParams
}

/** The inputs the verdict's own query carries, parsed the way /switch parses them. */
export function verdictFacts(back: string | null): VerdictFacts {
  const params = backParams(back)
  const rawPrice = params?.get('price') ?? ''
  const price = Number(rawPrice)
  return {
    fuel: VERDICT_FUELS.find((f) => f === params?.get('fuel')) ?? null,
    billUtility: narrowSender(parseBillUtility(params?.get('ut'))),
    tier: TIERS.find((t) => t === params?.get('tier')) ?? null,
    unitPrice: rawPrice !== '' && Number.isFinite(price) && price > 0 ? price : null,
  }
}

/** /switch reads the verdict's query string as is. */
export function switchHref(back: string | null): string | null {
  const search = backParams(back)?.toString()
  return search ? `/switch?${search}` : null
}
