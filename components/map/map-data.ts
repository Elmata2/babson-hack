/**
 * @built F-41 map data: town polygons, tract polygons joined to ACS stats, EJ flags
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
import { anchorOf, bboxOf, centroidOf, geometryHas, type AreaGeometry } from '@/lib/map/geometry'
import { buildEnergyTowns, type BakedEnergy, type EnergyTown } from '@/lib/map/energy-model'

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
      centroid: centroidOf(geometry),
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

/** Tract polygons with `oilShare`, `households`, `oilHouseholds` joined from ACS B25040. */
export async function loadTracts(): Promise<TractData> {
  const topo = await json<Topology>('/data/ma-tracts.topo.json')
  const collection = feature(topo, topo.objects.tracts) as unknown as FeatureCollection<Geometry, Record<string, unknown>>
  for (const f of collection.features) {
    const geoid = String(f.properties?.geoid ?? '')
    const stats = tractStats(geoid)
    f.properties = {
      geoid,
      // -1, not 0, for a tract with nobody in it: a grey tract is not a 0% tract.
      oilShare: stats && stats.households > 0 ? stats.oilShare : -1,
      households: stats?.households ?? 0,
      oilHouseholds: stats?.oilHouseholds ?? 0,
    }
  }
  return { collection }
}

/** Tract GEOIDs that hold at least one EJ block group. Used only to draw the overlay. */
export async function loadEjTracts(): Promise<Set<string>> {
  const raw = await json<{ tracts: Record<string, unknown> }>('/data/ej-blockgroups.json')
  return new Set(Object.keys(raw.tracts))
}

/** Stamp `ej` (1 or 0) on each tract. Heat values are untouched. */
export function markEj(tracts: TractData, ejTracts: Set<string>): void {
  for (const f of tracts.collection.features) f.properties = { ...f.properties, ej: ejTracts.has(String(f.properties?.geoid)) ? 1 : 0 }
}
