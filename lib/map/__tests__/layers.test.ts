/**
 * @built F-42 F-43 F-45 F-58 the layer wiring, checked without a browser
 *
 * There is no MapLibre instance in the test run, so `applyLens` is called against a
 * stub that records what it would have painted. That is enough to hold the two
 * promises the components make: the fill expression names the property the metric
 * and year select, and the equity lens changes one layout property and nothing else.
 */

import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Map as MlMap } from 'maplibre-gl'
import { applyLens, type LensState } from '@/components/map/layers'
import { heatProps, heatRow } from '../heat'

interface FakeLayer {
  id: string
  type?: string
  filter?: unknown
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

class FakeMap {
  layers = new Map<string, FakeLayer>()
  sources = new Map<string, { setData: (data: unknown) => void }>()
  paint: Record<string, unknown> = {}
  filters: Record<string, unknown> = {}
  layout: Record<string, unknown> = {}

  getLayer(id: string) {
    return this.layers.get(id)
  }

  addLayer(spec: FakeLayer) {
    this.layers.set(spec.id, spec)
  }

  removeLayer(id: string) {
    this.layers.delete(id)
  }

  addSource(id: string) {
    this.sources.set(id, { setData: () => {} })
  }

  getSource(id: string) {
    return this.sources.get(id)
  }

  removeSource(id: string) {
    this.sources.delete(id)
  }

  setPaintProperty(layer: string, key: string, value: unknown) {
    this.paint[`${layer}.${key}`] = value
  }

  setLayoutProperty(layer: string, key: string, value: unknown) {
    this.layout[`${layer}.${key}`] = value
  }

  setFilter(layer: string, value: unknown) {
    this.filters[layer] = value
  }
}

const TRACTS: FeatureCollection<Geometry, Record<string, unknown>> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-71.1, 42.3], [-71.0, 42.3], [-71.0, 42.4], [-71.1, 42.4], [-71.1, 42.3]]] },
      properties: {
        geoid: '25017383402',
        ...heatProps(heatRow({ geoid: '25017383402', households: 1000, oilHouseholds: 400 })!),
        households: 1000,
        oilHouseholds: 400,
        ej: 1,
      },
    },
  ],
}

function state(overrides: Partial<LensState> = {}): LensState {
  return {
    lens: 'heat',
    towns: null,
    tracts: { collection: TRACTS },
    metric: 'usage',
    colourBy: 'provider',
    region: 'ALL',
    showSolar: false,
    showLabels: true,
    ejOn: false,
    heatMetric: 'cliff_dollars',
    heatYear: 2027,
    selectedKey: null,
    selectedTract: null,
    ...overrides,
  }
}

const fillOf = (map: FakeMap) => JSON.stringify(map.paint['tracts-fill.fill-color'])

describe('the heat fill follows the metric and the year', () => {
  it('paints the 2027 dollars from the stamped property, with the dollar breaks', () => {
    const map = new FakeMap()
    applyLens(map as unknown as MlMap, state())
    const fill = fillOf(map)
    expect(fill).toContain('cliffDollars2027')
    expect(fill).toContain('1000000')
    expect(fill).toContain('#ac451c')
    // A grey tract is a tract with no estimate, not a zero.
    expect(fill).toContain('#d9d6cf')
  })

  it('paints the 2026 cohort instead, because no dollars have been lost yet', () => {
    const map = new FakeMap()
    applyLens(map as unknown as MlMap, state({ heatYear: 2026 }))
    const fill = fillOf(map)
    expect(fill).toContain('cliffHomes2026')
    expect(fill).not.toContain('cliffDollars2027')
  })

  it('repaints on a metric switch rather than adding a second layer', () => {
    const map = new FakeMap()
    applyLens(map as unknown as MlMap, state())
    applyLens(map as unknown as MlMap, state({ heatMetric: 'oil_spend' }))
    expect([...map.layers.keys()].filter((id) => id === 'tracts-fill')).toHaveLength(1)
    expect(fillOf(map)).toContain('oilSpend')
  })

  it('leaves the heat fill identical with the equity lens on (R10.9)', () => {
    const off = new FakeMap()
    const on = new FakeMap()
    applyLens(off as unknown as MlMap, state({ ejOn: false }))
    applyLens(on as unknown as MlMap, state({ ejOn: true }))
    expect(fillOf(on)).toBe(fillOf(off))
    expect(on.layout['ej-overlay.visibility']).toBe('visible')
    expect(off.layout['ej-overlay.visibility']).toBe('none')
    // The overlay is a separate, neutral layer; it never touches the choropleth.
    expect(on.paint['tracts-fill.fill-color']).toEqual(off.paint['tracts-fill.fill-color'])
  })

  it('draws nothing before the tract geometry is in', () => {
    const map = new FakeMap()
    applyLens(map as unknown as MlMap, state({ tracts: null }))
    expect(map.getLayer('tracts-fill')).toBeUndefined()
  })
})
