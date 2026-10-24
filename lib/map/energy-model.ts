/**
 * @built F-72 the Energy lens's MOCK demand and solar model
 *
 * Nothing here is measured. Town demand is the statewide annual constant spread by
 * area and a hand-placed urban index; solar likewise. The shape of the day is a
 * fixed curve. It exists so the 3D columns and the polar clock have something to
 * move, and every surface that shows it says "Demand and solar figures are invented."
 *
 * Deterministic: a town name seeds its own jitter, so a reload draws the same map.
 * Pure: no clock, no network, no DOM.
 */

import type { SponsorKey } from '@/lib/elec-label'

export type Metric = 'demand' | 'solar' | 'net'
export type Zone = 'NEMA' | 'SEMA' | 'WCMA'

/** Statewide anchors the town figures must sum to. Invented, like the rest. */
export const MA_ANNUAL_TWH = 55
export const MA_SOLAR_MW = 4500
/** Share of nameplate that reaches the grid at the sun's peak. */
const SOLAR_DERATE = 0.8

/** Relative hourly demand, index 0 = midnight. */
export const LOAD_SHAPE: readonly number[] = [
  0.62, 0.58, 0.56, 0.55, 0.57, 0.63, 0.74, 0.84, 0.88, 0.89, 0.9, 0.9, 0.89, 0.88, 0.88, 0.9, 0.95, 1, 1, 0.97, 0.92, 0.84,
  0.75, 0.67,
]
/** Relative hourly solar output, zero at night. */
export const SOLAR_SHAPE: readonly number[] = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) ** 1.5)

/** ISO-NE load zone by county name. Bristol sits in SEMA, as in the prototype. */
export const ZONE_BY_COUNTY: Record<string, Zone> = {
  Suffolk: 'NEMA',
  Middlesex: 'NEMA',
  Essex: 'NEMA',
  Norfolk: 'NEMA',
  Plymouth: 'SEMA',
  Bristol: 'SEMA',
  Barnstable: 'SEMA',
  Dukes: 'SEMA',
  Nantucket: 'SEMA',
  Worcester: 'WCMA',
  Hampden: 'WCMA',
  Hampshire: 'WCMA',
  Franklin: 'WCMA',
  Berkshire: 'WCMA',
}

export const ZONE_LABEL: Record<Zone | 'ALL', string> = {
  ALL: 'All Massachusetts',
  NEMA: 'NEMA · Boston & North Shore',
  SEMA: 'SEMA · South Shore & Cape',
  WCMA: 'WCMA · Central & Western',
}

/** [lat, lng, weight]: where the mock puts the cities. */
const CITIES: readonly [number, number, number][] = [
  [42.36, -71.06, 12],
  [42.37, -71.11, 5],
  [42.26, -71.8, 3],
  [42.1, -72.59, 3],
  [42.64, -71.32, 2],
  [41.64, -70.93, 1.5],
  [42.08, -71.02, 1.5],
  [41.7, -71.15, 1.5],
  [42.71, -71.16, 1.5],
  [42.45, -73.25, 1],
]

export interface TownInput {
  /** Any stable unique name; it seeds the jitter. */
  town: string
  county: string
  centroid: [number, number]
  areaKm2: number
  /** Sponsors that serve the town. Empty is treated as one unknown sponsor. */
  sponsors: SponsorKey[]
}

export interface EnergyTown extends TownInput {
  zone: Zone
  mixed: boolean
  /** The sole sponsor, or 'mixed'. */
  provider: SponsorKey | 'mixed'
  annualMWh: number
  /** MW when the load shape is 1. */
  peakMW: number
  /** Nameplate MW. */
  solarMW: number
}

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967295
}

const AVG_LOAD = LOAD_SHAPE.reduce((a, b) => a + b, 0) / 24

/** Spread the statewide constants over the towns. Totals equal the constants exactly. */
export function buildEnergyTowns(inputs: readonly TownInput[]): EnergyTown[] {
  const raw = inputs.map((t) => {
    const [lng, lat] = t.centroid
    const urban = CITIES.reduce((s, [cy, cx, w]) => s + w * Math.exp(-Math.hypot((lat - cy) * 111, (lng - cx) * 82) / 9), 0)
    return {
      demand: (t.areaKm2 * 0.4 + 6) * (0.15 + urban) * (0.8 + 0.4 * hash(t.town)),
      solar: t.areaKm2 * (1.6 - Math.min(urban, 1.2)) * (0.6 + 0.8 * hash(`${t.town}s`)),
    }
  })
  const sumD = raw.reduce((s, r) => s + r.demand, 0) || 1
  const sumS = raw.reduce((s, r) => s + r.solar, 0) || 1
  return inputs.map((t, i) => {
    const sponsors: SponsorKey[] = t.sponsors.length > 0 ? t.sponsors : ['other']
    const annualMWh = (raw[i].demand / sumD) * MA_ANNUAL_TWH * 1e6
    return {
      ...t,
      sponsors,
      zone: ZONE_BY_COUNTY[t.county] ?? 'WCMA',
      mixed: sponsors.length > 1,
      provider: sponsors.length > 1 ? 'mixed' : sponsors[0],
      annualMWh,
      peakMW: annualMWh / 8760 / AVG_LOAD,
      solarMW: (raw[i].solar / sumS) * MA_SOLAR_MW,
    }
  })
}

export function demandAt(t: EnergyTown, hour: number): number {
  return t.peakMW * LOAD_SHAPE[hour]
}

export function solarAt(t: EnergyTown, hour: number): number {
  return t.solarMW * SOLAR_SHAPE[hour] * SOLAR_DERATE
}

/** The metric's MW for one town at one hour. Net load is floored at zero. */
export function valueAt(t: EnergyTown, hour: number, metric: Metric): number {
  const demand = demandAt(t, hour)
  const solar = solarAt(t, hour)
  return metric === 'demand' ? demand : metric === 'solar' ? solar : Math.max(0, demand - solar)
}

export interface Totals {
  demand: number
  solar: number
  /** Demand by sponsor; a mixed town splits evenly across its sponsors. */
  byProvider: Partial<Record<SponsorKey, number>>
}

export function totalsAt(towns: readonly EnergyTown[], hour: number): Totals {
  const totals: Totals = { demand: 0, solar: 0, byProvider: {} }
  for (const t of towns) {
    const demand = demandAt(t, hour)
    totals.demand += demand
    totals.solar += solarAt(t, hour)
    for (const s of t.sponsors) totals.byProvider[s] = (totals.byProvider[s] ?? 0) + demand / t.sponsors.length
  }
  return totals
}

export function hourLabel(h: number): string {
  return h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function formatMW(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : mw >= 10 ? `${Math.round(mw)} MW` : `${mw.toFixed(1)} MW`
}
