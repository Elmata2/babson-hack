/**
 * @built F-41 map data: town polygons, tract polygons joined to ACS stats, EJ flags
 * @built F-43 every heat metric rides on the tract feature, so a metric switch is a repaint
 *
 * Data files are same-origin statics under /data. The only third-party requests the map
 * makes are basemap tiles (OpenFreeMap, CARTO) and, via /api/geocode, the Census geocoder.
 */

import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Topology } from 'topojson-specification'
import { townKey } from '@/lib/elec-label'
import { displayTown, tractStats } from '@/lib/geo'
import { resolveUtility } from '@/lib/utility'
import { anchorOf, bboxOf, geometryHas, type AreaGeometry } from '@/lib/map/geometry'
import { buildEnergyTowns, type BakedEnergy, type EnergyTown } from '@/lib/map/energy-model'
import { EJ_TRACTS } from '@/lib/map/equity'
import { heatProps, heatRow } from '@/lib/map/heat'

export interface TownEntry {
  /** Display name, "Wellesley". */
  name: string
  key: string
  county: string
  geometry: AreaGeometry
  anchor: [number, number]
  bbox: [number, number, number, number]
  energy: EnergyTown
}

export interface TownData {
  /** Features carry mutable energy props, rewritten before each `setData`. */
  collection: FeatureCollection<Geometry, Record<string, unknown>>
  entries: TownEntry[]
  byKey: Map<string, TownEntry>
  /** The baked usage, solar and zonal load behind every `entry.energy`. */
  baked: BakedEnergy
}

export interface TractData {
  collection: FeatureCollection<Geometry, Record<string, unknown>>
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return (await res.json()) as T
}

interface RawTownProps {
  geoid: string
  town: string
  county: string
}

export async function loadTowns(): Promise<TownData> {
  const [raw, baked] = await Promise.all([
    json<FeatureCollection<Geometry, RawTownProps>>('/data/ma-towns.json'),
    json<BakedEnergy>('/data/ma-town-energy.json'),
  ])
  const entries: TownEntry[] = []
  const features: Feature<Geometry, Record<string, unknown>>[] = []
  const inputs = raw.features.map((f) => {
    const geometry = f.geometry as AreaGeometry
    const name = displayTown(f.properties.town)
    return {
      source: f.properties.town,
      town: name,
      county: f.properties.county,
      centroid: anchorOf(geometry),
      sponsors: resolveUtility(name).sponsors,
    }
  })
  const energy = buildEnergyTowns(inputs, baked)
  raw.features.forEach((f, i) => {
    const geometry = f.geometry as AreaGeometry
    const name = inputs[i].town
    entries.push({
      name,
      key: townKey(name),
      county: f.properties.county,
      geometry,
      anchor: anchorOf(geometry),
      bbox: bboxOf(geometry),
      energy: energy[i],
    })
    features.push({ type: 'Feature', geometry: f.geometry, properties: { town: name, key: townKey(name) } })
  })
  return {
    collection: { type: 'FeatureCollection', features },
    entries,
    byKey: new Map(entries.map((e) => [e.key, e])),
    baked,
  }
}

/** Point-in-polygon over the 351 towns. Display name, or null outside Massachusetts. */
export function townAtPoint(data: TownData, lon: number, lat: number): TownEntry | null {
  for (const e of data.entries) {
    const [w, s, ea, n] = e.bbox
    if (lon < w || lon > ea || lat < s || lat > n) continue
    if (geometryHas(e.geometry, lon, lat)) return e
  }
  return null
}

/**
 * Tract polygons with the heat metrics joined from ACS B25040, plus the EJ flag.
 *
 * `heatProps` stamps every metric the switcher can draw for both years, so changing
 * metric or year is `setPaintProperty` and never a second fetch. A tract with no
 * occupied households carries `-1` (grey in the palette), not `0` — a grey tract is
 * not a 0% tract.
 */
export async function loadTracts(): Promise<TractData> {
  const topo = await json<Topology>('/data/ma-tracts.topo.json')
  const collection = feature(topo, topo.objects.tracts) as unknown as FeatureCollection<Geometry, Record<string, unknown>>
  for (const f of collection.features) {
    const geoid = String(f.properties?.geoid ?? '')
    const stats = tractStats(geoid)
    const row = stats ? heatRow(stats) : null
    f.properties = {
      geoid,
      ...(row ? heatProps(row) : { oilShare: -1, oilSpend: -1, cliffHomes2026: -1, cliffHomes2027: -1, cliffDollars2026: -1, cliffDollars2027: -1 }),
      // Hover and the panel read the raw counts, not the class breaks.
      households: stats?.households ?? 0,
      oilHouseholds: stats?.oilHouseholds ?? 0,
      // The equity lens is a flag here and two percentages in `lib/map/equity.ts`;
      // neither ever reaches a heat property.
      ej: EJ_TRACTS.has(geoid) ? 1 : 0,
    }
  }
  return { collection }
}

/**
 * Tracts that hold at least one EJ block group. Read from the committed artefact at
 * build time (`lib/map/equity.ts`), so the overlay never waits on a request and a
 * failed geometry chunk cannot take it down.
 */
export function ejTracts(): ReadonlySet<string> {
  return EJ_TRACTS
}
