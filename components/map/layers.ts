/**
 * @built F-71 lens layers: one function adds a lens's sources and layers, idempotently
 *
 * `map.setStyle` drops every custom source and layer, and a lens switch is a style
 * switch (diff off), so nothing from the previous lens can survive. `applyLens` runs
 * on every `style.load` and on every state change; each step checks before it adds.
 * Only the layers that belong to the active lens are ever added, and the cleanup pass
 * removes anything else, so a layer cannot leak across lenses.
 */

import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Lens } from './types'
import { heightShare, metricMax, metricValue, type Metric, type Zone } from '@/lib/map/energy-model'
import { heatScale, type HeatMetric, type HeatYear } from '@/lib/map/heat'
import type { TownData, TractData } from './map-data'
import { EJ_OPACITY, EJ_VIOLET, ENERGY_BG, HEAT_RAMP, LIGHT_BG, NO_DATA, PROVIDER_COLOUR, SOLAR_COLOUR } from './palette'

export const STYLE_URL: Record<Lens, string> = {
  energy: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
  heat: 'https://tiles.openfreemap.org/styles/positron',
}

export const LENS_BG: Record<Lens, string> = { energy: ENERGY_BG, heat: LIGHT_BG }

export interface LensState {
  lens: Lens
  towns: TownData | null
  tracts: TractData | null
  metric: Metric
  colourBy: 'provider' | 'intensity'
  region: Zone | 'ALL'
  showSolar: boolean
  showLabels: boolean
  ejOn: boolean
  /** Heat lens: which of the three metrics the choropleth encodes. */
  heatMetric: HeatMetric
  /** Heat lens: the toggle's install year. Only the cliff metrics move. */
  heatYear: HeatYear
  selectedKey: string | null
  selectedTract: string | null
}

const OWNED: Record<Lens, { sources: string[]; layers: string[] }> = {
  heat: {
    sources: ['tracts', 'sel'],
    layers: ['tracts-fill', 'ej-overlay', 'tracts-line', 'tract-sel', 'sel-line'],
  },
  energy: {
    sources: ['towns', 'points', 'sel'],
    layers: ['flat', 'columns', 'selected', 'outline', 'solar', 'labels', 'sel-line'],
  },
}
const ALL_LAYERS = [...new Set(Object.values(OWNED).flatMap((o) => o.layers))]
const ALL_SOURCES = [...new Set(Object.values(OWNED).flatMap((o) => o.sources))]

/** Layers a pointer can hit, per lens. */
export const HIT_LAYERS: Record<Lens, string[]> = { heat: ['tracts-fill'], energy: ['columns', 'selected', 'flat'] }

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Metres for the metric's tallest town at the widest zoom. Height goes as the square root of the value. */
const MAX_HEIGHT_M = 40000
/** Towns labelled per metric: the tallest ones in the shown region. */
const LABEL_TOP_N = 15
const HEIGHT_EXPR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  7,
  ['get', 'height'],
  10,
  ['*', ['get', 'height'], 0.12],
  12,
  ['*', ['get', 'height'], 0.03],
]

function intensityColour(t: number): string {
  const stops: [number, number[]][] = [
    [0, [30, 62, 90]],
    [0.5, [47, 163, 181]],
    [1, [180, 255, 236]],
  ]
  const i = t < 0.5 ? 0 : 1
  const [a, ca] = stops[i]
  const [b, cb] = stops[i + 1]
  const k = (t - a) / (b - a)
  return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(',')})`
}

const uploaded = new WeakMap<object, FeatureCollection>()

/** Uploads `data` once per source: re-sending 1,600 tracts re-tiles them in the worker, and a year change does not touch geometry. */
function setSourceOnce(map: MlMap, id: string, data: FeatureCollection): void {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (!src) {
    map.addSource(id, { type: 'geojson', data })
    uploaded.set(map.getSource(id) as object, data)
  } else if (uploaded.get(src) !== data) {
    src.setData(data)
    uploaded.set(src, data)
  }
}

function setSource(map: MlMap, id: string, data: FeatureCollection): void {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource(id, { type: 'geojson', data })
}

function addLayerOnce(map: MlMap, spec: Parameters<MlMap['addLayer']>[0]): void {
  if (!map.getLayer(spec.id)) map.addLayer(spec)
}

function selectedFeature(state: LensState): FeatureCollection {
  const entry = state.selectedKey && state.towns ? state.towns.byKey.get(state.selectedKey) : null
  if (!entry) return EMPTY
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: entry.geometry as Geometry, properties: {} }] }
}

function energyData(state: LensState): { towns: FeatureCollection; points: FeatureCollection } | null {
  const data = state.towns
  if (!data) return null
  const max = metricMax(
    data.entries.map((e) => e.energy),
    state.metric,
  )
  const ranked = data.entries
    .filter((e) => state.region === 'ALL' || e.energy.zone === state.region)
    .map((e) => ({ key: e.key, v: metricValue(e.energy, state.metric) ?? 0 }))
    .sort((a, b) => b.v - a.v)
  const rank = new Map(ranked.map((r, i) => [r.key, i]))
  const points: Feature[] = []
  data.entries.forEach((e, i) => {
    const t = e.energy
    const inRegion = state.region === 'ALL' || t.zone === state.region
    const dim = !inRegion && e.key !== state.selectedKey
    const v = metricValue(t, state.metric)
    const props = data.collection.features[i].properties as Record<string, unknown>
    props.height = dim || v === null ? 0 : heightShare(v, max) * MAX_HEIGHT_M
    props.colour =
      dim || v === null
        ? '#222c3d'
        : state.colourBy === 'provider'
          ? PROVIDER_COLOUR[t.provider]
          : intensityColour(heightShare(v, max))
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: t.centroid },
      properties: { name: e.name, rank: v === null ? 9999 : (rank.get(e.key) ?? 9999), solar: t.solarMW },
    })
  })
  return { towns: data.collection, points: { type: 'FeatureCollection', features: points } }
}

/** Bring the map's sources and layers in line with `state`. Safe to call any time the style is loaded. */
export function applyLens(map: MlMap, state: LensState): void {
  // Cleanup first: nothing that belongs to another lens may remain.
  const owned = OWNED[state.lens]
  for (const id of ALL_LAYERS) if (!owned.layers.includes(id) && map.getLayer(id)) map.removeLayer(id)
  for (const id of ALL_SOURCES) if (!owned.sources.includes(id) && map.getSource(id)) map.removeSource(id)

  setSource(map, 'sel', selectedFeature(state))

  if (state.lens === 'heat') {
    if (!state.tracts) return
    setSourceOnce(map, 'tracts', state.tracts.collection)
    // One function decides what the choropleth encodes for every metric and year,
    // and the legend reads the same function, so a scale cannot describe itself wrong.
    const scale = heatScale(state.heatMetric, state.heatYear)
    const breaks = scale.breaks
    const fill: ExpressionSpecification = [
      'case',
      // -1 is "no households or no estimate", and a grey tract is not a 0 tract.
      ['>=', ['get', scale.property], 0],
      [
        'step',
        ['get', scale.property],
        HEAT_RAMP[0],
        breaks[0],
        HEAT_RAMP[1],
        breaks[1],
        HEAT_RAMP[2],
        breaks[2],
        HEAT_RAMP[3],
        breaks[3],
        HEAT_RAMP[4],
      ],
      NO_DATA,
    ]
    addLayerOnce(map, { id: 'tracts-fill', type: 'fill', source: 'tracts', paint: { 'fill-color': fill, 'fill-opacity': 0.82 } })
    map.setPaintProperty('tracts-fill', 'fill-color', fill)
    addLayerOnce(map, {
      id: 'ej-overlay',
      type: 'fill',
      source: 'tracts',
      filter: ['==', ['get', 'ej'], 1],
      layout: { visibility: state.ejOn ? 'visible' : 'none' },
      paint: { 'fill-color': EJ_VIOLET, 'fill-opacity': EJ_OPACITY },
    })
    addLayerOnce(map, {
      id: 'tracts-line',
      type: 'line',
      source: 'tracts',
      paint: { 'line-color': '#3a342c', 'line-opacity': 0.3, 'line-width': 0.5 },
    })
    addLayerOnce(map, {
      id: 'tract-sel',
      type: 'line',
      source: 'tracts',
      filter: ['==', ['get', 'geoid'], state.selectedTract ?? ''],
      paint: { 'line-color': '#1d1a16', 'line-width': 2.5 },
    })
    addLayerOnce(map, { id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#266ec3', 'line-width': 2, 'line-dasharray': [2, 1.5] } })
    map.setLayoutProperty('ej-overlay', 'visibility', state.ejOn ? 'visible' : 'none')
    map.setFilter('tract-sel', ['==', ['get', 'geoid'], state.selectedTract ?? ''])
    return
  }

  // Energy
  const data = energyData(state)
  if (!data) return
  setSource(map, 'towns', data.towns)
  setSource(map, 'points', data.points)
  const sel = state.selectedKey ?? ''
  addLayerOnce(map, { id: 'flat', type: 'fill', source: 'towns', paint: { 'fill-color': '#1a2740', 'fill-opacity': 0.55 } })
  addLayerOnce(map, {
    id: 'columns',
    type: 'fill-extrusion',
    source: 'towns',
    filter: ['!=', ['get', 'key'], sel],
    paint: {
      'fill-extrusion-color': ['get', 'colour'],
      'fill-extrusion-height': HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.88,
    },
  })
  addLayerOnce(map, {
    id: 'selected',
    type: 'fill-extrusion',
    source: 'towns',
    filter: ['==', ['get', 'key'], sel],
    paint: { 'fill-extrusion-color': '#ffb703', 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-opacity': 0.95 },
  })
  addLayerOnce(map, {
    id: 'outline',
    type: 'line',
    source: 'towns',
    paint: { 'line-color': 'rgba(255,255,255,.12)', 'line-width': 0.5 },
  })
  addLayerOnce(map, {
    id: 'solar',
    type: 'circle',
    source: 'points',
    paint: {
      'circle-color': SOLAR_COLOUR,
      'circle-opacity': 0.75,
      'circle-blur': 0.3,
      'circle-radius': ['interpolate', ['linear'], ['get', 'solar'], 0, 0, 10, 4, 70, 12],
    },
  })
  addLayerOnce(map, {
    id: 'labels',
    type: 'symbol',
    source: 'points',
    filter: ['<', ['get', 'rank'], LABEL_TOP_N],
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Open Sans Regular'] },
    paint: { 'text-color': '#e6edf7', 'text-halo-color': '#0b1220', 'text-halo-width': 1.2 },
  })
  addLayerOnce(map, { id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': '#ffb703', 'line-width': 3 } })
  map.setFilter('columns', ['!=', ['get', 'key'], sel])
  map.setFilter('selected', ['==', ['get', 'key'], sel])
  map.setLayoutProperty('solar', 'visibility', state.showSolar ? 'visible' : 'none')
  map.setLayoutProperty('labels', 'visibility', state.showLabels ? 'visible' : 'none')
}
