'use client'

/**
 * @built F-41 map shell: MapLibre canvas, left rail, right panel, state ownership
 * @built F-42 tract choropleth (Heat lens; layers live in `layers.ts`)
 * @built F-43 Heat lens metrics: oil share, oil spend, the Jan 1 cliff
 * @built F-44 hover tooltip and click-a-tract → Town tab
 * @built F-45 the 2026 ↔ 2027 scrubber and the tweened statewide loss
 * @built F-46 click → panel → "use this tract" seeds the calculator
 * @built F-47 the table view and its keyboard path, beside the map
 * @built F-48 the static SVG fallback and the tile-failure path
 * @built F-71 lenses (Energy | Heat), camera
 * @built F-72 Energy lens: 3D town columns, timeline, polar clock
 * @built F-75 Energy lens on real usage and solar data
 *
 * One map instance, two lenses. A lens is a basemap plus the sources and layers
 * in `layers.ts`; switching calls `setStyle(url, { diff: false })`, which drops every
 * custom layer, and `applyLens` re-adds only the active lens's layers on `style.load`.
 * The selected town, the pin and the profile live outside the style and survive it.
 */

import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { type Map as MlMap, type MapMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BillPanel } from './bill-panel'
import { CameraControls, prefersReducedMotion, useCamera } from './camera-controls'
import { EnergyLegend } from './energy-legend'
import { HeatControls, HeatHeadline } from './heat-controls'
import { HeatStatic } from './heat-static'
import { HeatTable } from './heat-table'
import { applyLens, HIT_LAYERS, LENS_BG, STYLE_URL, type LensState } from './layers'
import { loadTowns, loadTracts, townAtPoint, type TownData, type TractData } from './map-data'
import { ProfileDrawer } from './profile-drawer'
import { Search, type SearchResult } from './search'
import { TownPanel } from './town-panel'
import type { Lens, Profile } from './types'
import { useProfile } from './use-profile'
import { townKey } from '@/lib/elec-label'
import { displayTown, townsOfTract } from '@/lib/geo'
import { SPONSOR_NAME } from '@/lib/utility'
import { parseNextStepsQuery, type NextStepsQuery } from '@/lib/map/next-steps-query'
import {
  METRIC_LABEL,
  ZONE_LABEL,
  describeTown,
  metricMax,
  sourceLine,
  type Metric,
  type Zone,
} from '@/lib/map/energy-model'
import {
  ASSUMPTION_NOTE,
  OIL_PRICE_AS_OF,
  cliffDollarsFor,
  formatMillions,
  headline,
  oilSpendFor,
  type HeatMetric,
  type HeatYear,
} from '@/lib/map/heat'

type Tab = 'town' | 'bill'

const STATE_CENTER: [number, number] = [-71.75, 42.2]
const STATE_ZOOM = 7.2
const VIEW: Record<Lens, { pitch: number; bearing: number }> = {
  energy: { pitch: 55, bearing: -12 },
  heat: { pitch: 0, bearing: 0 },
}
const REGION_VIEW: Record<Zone | 'ALL', { center: [number, number]; zoom: number }> = {
  ALL: { center: STATE_CENTER, zoom: STATE_ZOOM },
  NEMA: { center: [-71.1, 42.48], zoom: 8.9 },
  SEMA: { center: [-70.75, 41.85], zoom: 8.4 },
  WCMA: { center: [-72.3, 42.35], zoom: 8.2 },
}
const LENSES: { id: Lens; label: string }[] = [
  { id: 'energy', label: 'Energy' },
  { id: 'heat', label: 'Heat' },
]

interface CameraTarget {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

export default function MapView() {
  const { profile, update, clear } = useProfile()

  const [lens, setLens] = useState<Lens>('energy')
  const [tab, setTab] = useState<Tab>('town')
  /** No WebGL: the Heat numbers still work, so the Heat rail must stay usable. */
  const [fallback, setFallback] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedTract, setSelectedTract] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('usage')
  const [colourBy, setColourBy] = useState<'provider' | 'intensity'>('provider')
  const [region, setRegion] = useState<Zone | 'ALL'>('ALL')
  const [showSolar, setShowSolar] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [ejOn, setEjOn] = useState(false)
  const [heatMetric, setHeatMetric] = useState<HeatMetric>('cliff_dollars')
  const [heatYear, setHeatYear] = useState<HeatYear>(2026)
  const [showTable, setShowTable] = useState(false)
  const [showStatic, setShowStatic] = useState(false)
  const [staticReason, setStaticReason] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [towns, setTowns] = useState<TownData | null>(null)
  const [tracts, setTracts] = useState<TractData | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const pinRef = useRef<maplibregl.Marker | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const styleLens = useRef<Lens | null>(null)
  const pendingLens = useRef<Lens>('energy')
  const lensStateRef = useRef<LensState | null>(null)
  const handlersRef = useRef<{ click: (e: MapMouseEvent) => void; move: (e: MapMouseEvent) => void }>({
    click: () => {},
    move: () => {},
  })
  const homeFocused = useRef(false)
  const hoverKey = useRef<string | null>(null)
  const hoverEvent = useRef<MapMouseEvent | null>(null)
  const hoverFrame = useRef<number | null>(null)
  const committedLens = useRef<Lens | null>(null)
  const staticShown = useRef(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [query] = useState<NextStepsQuery>(() => parseNextStepsQuery(new URLSearchParams(window.location.search)))

  const getMap = useCallback(() => mapRef.current, [])
  const camera = useCamera(getMap, ready)

  const selectedEntry = selectedKey && towns ? (towns.byKey.get(selectedKey) ?? null) : null
  const selectedName = selectedKey ? displayTown(selectedKey) : null

  // ------------------------------------------------------------------ data
  useEffect(() => {
    let alive = true
    loadTowns()
      .then((d) => alive && setTowns(d))
      .catch(() => alive && setDataError('Town boundaries did not load. Reload the page to try again.'))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (lens !== 'heat' || tracts) return
    let alive = true
    loadTracts()
      .then((d) => alive && setTracts(d))
      .catch(
        () =>
          alive &&
          setDataError('Tract boundaries did not load. The county figures, the table view and the static map still work.'),
      )
    return () => {
      alive = false
    }
  }, [lens, tracts])


  // ------------------------------------------------------------------ camera
  const moveTo = useCallback((target: Partial<CameraTarget>, how: 'fly' | 'ease' = 'fly') => {
    const map = mapRef.current
    if (!map) return
    if (prefersReducedMotion()) return void map.jumpTo(target)
    if (how === 'fly') map.flyTo({ ...target, curve: 1.4, duration: 1600, essential: false })
    else map.easeTo({ ...target, duration: 900 })
  }, [])

  const dropPin = useCallback((lngLat: [number, number]) => {
    const map = mapRef.current
    if (!map) return
    if (!pinRef.current) {
      const el = document.createElement('div')
      el.className = 'size-3.5 rounded-full border-[3px] border-switch bg-white shadow-[0_0_0_3px_rgba(32,96,64,0.28)]'
      pinRef.current = new maplibregl.Marker({ element: el })
    }
    pinRef.current.setLngLat(lngLat).addTo(map)
  }, [])

  const selectTown = useCallback((key: string | null, keepTract = false) => {
    homeFocused.current = true
    setSelectedKey(key)
    if (!keepTract) setSelectedTract(null)
  }, [])

  /**
   * Select a tract from anywhere — a map click, the table, a keyboard Enter — and
   * open the panel that explains it. The map and the table are two doors to one room.
   */
  const selectTract = useCallback(
    (geoid: string, townName?: string | null) => {
      setSelectedTract(geoid)
      const touching = townsOfTract(geoid)
      const key = townName ? townKey(townName) : touching[0] ? townKey(touching[0]) : null
      if (key) selectTown(key, true)
      setTab('town')
    },
    [selectTown],
  )

  const changeLens = useCallback(
    (next: Lens, opts: { skipCamera?: boolean } = {}) => {
      const map = mapRef.current
      if (!map) {
        // Without WebGL only the Heat lens has content (metrics, scrubber, table).
        if (next !== lens && next === 'heat') {
          setLens(next)
          setTab('town')
        }
        return
      }
      if (next === lens) return
      camera.stopOrbit()
      popupRef.current?.remove()
      hoverKey.current = null
      setMapError(null)
      styleLens.current = null
      pendingLens.current = next
      setSwapping(!prefersReducedMotion())
      setLens(next)
      map.setStyle(STYLE_URL[next], { diff: false })
      if (opts.skipCamera) return
      const view = VIEW[next]
      if (selectedEntry) moveTo({ center: selectedEntry.anchor, zoom: next === 'energy' ? 9.5 : 10.5, ...view })
      else moveTo({ center: STATE_CENTER, zoom: STATE_ZOOM, ...view })
    },
    [camera, lens, moveTo, selectedEntry],
  )

  // A style that never reports `style.load` must not leave the map invisible.
  useEffect(() => {
    if (!swapping) return
    const t = setTimeout(() => setSwapping(false), 4000)
    return () => clearTimeout(t)
  }, [swapping])

  const resetView = useCallback(() => {
    camera.stopOrbit()
    moveTo({ center: STATE_CENTER, zoom: STATE_ZOOM, ...VIEW[lens] }, 'ease')
  }, [camera, lens, moveTo])

  const onResult = useCallback(
    (r: SearchResult) => {
      camera.stopOrbit()
      selectTown(townKey(r.town))
      const entry = towns?.byKey.get(townKey(r.town)) ?? null
      if (r.kind === 'town') {
        if (!entry) return
        dropPin(entry.anchor)
        moveTo({ center: entry.anchor, zoom: lens === 'energy' ? 10.5 : 12 })
        return
      }
      const point: [number, number] = [r.lon, r.lat]
      dropPin(point)
      setTab('town')
      moveTo({ center: point, zoom: lens === 'energy' ? 11 : r.kind === 'address' ? 15 : 13 })
    },
    [camera, dropPin, lens, moveTo, selectTown, towns],
  )

  const onUseHome = useCallback(
    (r: SearchResult) => {
      homeFocused.current = true
      const sameTown = r.town === profile.town
      const patch: Partial<Profile> = { town: r.town }
      // A ZIP or town result says nothing about the street: keep the saved address only if the town is unchanged.
      if (r.kind === 'address') patch.address = r.address
      else if (!sameTown) patch.address = ''
      if (!sameTown) patch.utility = null
      update(patch)
    },
    [profile.town, update],
  )

  const townAt = useCallback(
    (lon: number, lat: number) => (towns ? (townAtPoint(towns, lon, lat)?.name ?? null) : null),
    [towns],
  )

  // ------------------------------------------------------------------ map events
  useEffect(() => {
    handlersRef.current.click = (e) => {
      const map = mapRef.current
      if (!map) return
      const ids = HIT_LAYERS[lens].filter((id) => map.getLayer(id))
      const hit = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined
      if (lens === 'heat') {
        const geoid = hit ? String(hit.properties?.geoid ?? '') : ''
        if (!geoid) return
        const here = towns ? townAtPoint(towns, e.lngLat.lng, e.lngLat.lat) : null
        const touching = townsOfTract(geoid).map(townKey)
        // The click point wins when the tract straddles a town line.
        const key = here && touching.includes(here.key) ? here.key : (touching[0] ?? here?.key ?? null)
        selectTract(geoid, key ? displayTown(key) : null)
      } else {
        const key = hit ? String(hit.properties?.key ?? '') : ''
        selectTown(key || null)
      }
    }
    const run = (e: MapMouseEvent) => {
      const map = mapRef.current
      if (!map) return
      const popup = popupRef.current
      const ids = HIT_LAYERS[lens].filter((id) => map.getLayer(id))
      const hit = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids })[0] : undefined
      map.getCanvas().style.cursor = hit ? 'pointer' : ''
      if (!hit || !popup) {
        hoverKey.current = null
        return void popup?.remove()
      }
      const p = hit.properties ?? {}
      const id = lens === 'heat' ? `t${String(p.geoid)}` : `k${String(p.key)}|${metric}`
      if (id === hoverKey.current) return void popup.setLngLat(e.lngLat)
      const box = document.createElement('div')
      const line = (text: string, strong = false) => {
        const row = document.createElement('div')
        row.textContent = text
        if (strong) row.style.fontWeight = '600'
        box.appendChild(row)
      }
      if (lens === 'heat') {
        const share = typeof p.oilShare === 'number' && p.oilShare >= 0 ? `${(Math.round(p.oilShare * 1000) / 10).toLocaleString('en-US')}%` : 'no estimate'
        const oilHouseholds = Number(p.oilHouseholds)
        const tractTowns = townsOfTract(String(p.geoid))
        line(tractTowns[0] ? `${tractTowns[0]} · tract ${String(p.geoid)}` : `Tract ${String(p.geoid)}`, true)
        line(`${Number(p.households).toLocaleString('en-US')} households · ${share} oil-heated`)
        line(`${oilHouseholds.toLocaleString('en-US')} oil-heated households`)
        // R10.3 plus the design's transparency rule: the spend carries its assumption.
        line(`Spend ${formatMillions(oilSpendFor(oilHouseholds))}/yr (${ASSUMPTION_NOTE}, DOER ${OIL_PRICE_AS_OF})`)
        line(`Up to ${formatMillions(cliffDollarsFor(oilHouseholds))} lost if they wait until 2027`)
      } else {
        const entry = towns?.byKey.get(String(p.key))
        if (!entry) return
        const t = entry.energy
        line(entry.name, true)
        line(`${t.mixed ? t.sponsors.map((sp) => SPONSOR_NAME[sp]).join(' / ') : SPONSOR_NAME[t.sponsors[0]]}`)
        if (towns) line(describeTown(t, metric, towns.baked._meta))
      }
      hoverKey.current = id
      popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map)
    }
    // At most one hit-test per animation frame, and the popup is rebuilt only when the hovered feature changes.
    handlersRef.current.move = (e) => {
      hoverEvent.current = e
      if (hoverFrame.current !== null) return
      hoverFrame.current = requestAnimationFrame(() => {
        hoverFrame.current = null
        if (hoverEvent.current) run(hoverEvent.current)
      })
    }
  })

  const focusTown = useCallback(
    (entry: TownData['entries'][number]) => {
      selectTown(entry.key)
      dropPin(entry.anchor)
      setTab('town')
      const [w, s, e, n] = entry.bbox
      const cx = (w + e) / 2
      const cy = (s + n) / 2
      const hw = ((e - w) / 2) * 3
      const hh = ((n - s) / 2) * 3
      const fit = mapRef.current?.cameraForBounds([cx - hw, cy - hh, cx + hw, cy + hh], { bearing: VIEW.energy.bearing })
      moveTo({ center: fit?.center ? (maplibregl.LngLat.convert(fit.center).toArray() as [number, number]) : entry.anchor, zoom: Math.min(fit?.zoom ?? 10, 11), ...VIEW.energy })
    },
    [selectTown, dropPin, moveTo],
  )

  // The verdict's hand-off wins; otherwise the saved home town is where the map opens.
  useEffect(() => {
    if (!ready || !towns || homeFocused.current) return
    const fromQuery = query.town ? (towns.byKey.get(townKey(query.town)) ?? null) : null
    if (fromQuery) {
      homeFocused.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      focusTown(fromQuery)
      return
    }
    const home = profile.town ? (towns.byKey.get(townKey(profile.town)) ?? null) : null
    if (!home) return
    homeFocused.current = true
    focusTown(home)
  }, [ready, towns, query, profile.town, focusTown])

  // ------------------------------------------------------------------ map lifecycle
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // R10.1: no WebGL is a fallback case, not a crash. A headless browser, a
    // locked-down laptop, a projector with 3D disabled — the static image and
    // the table still answer the question, so the page must not unmount.
    let map: MlMap
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL[pendingLens.current],
        center: STATE_CENTER,
        zoom: STATE_ZOOM,
        pitch: VIEW[pendingLens.current].pitch,
        bearing: VIEW[pendingLens.current].bearing,
        maxPitch: 85,
        attributionControl: { compact: true },
        dragRotate: true,
        touchPitch: true,
      })
    } catch {
      // Deferred: this runs before React commits the effect, and the fallback is
      // a consequence of a failed external system, not of this render.
      queueMicrotask(() => {
        setReady(false)
        setFallback(true)
        setLens('heat')
        setTab('town')
        setMapError('This browser cannot draw the interactive map. The static map and the table view still work.')
        if (!staticShown.current) {
          staticShown.current = true
          setStaticReason('WebGL is unavailable in this browser, so this is the same data as a still image.')
          setShowStatic(true)
        }
      })
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.touchZoomRotate.enableRotation()
    const wide = window.matchMedia('(min-width: 1024px)')
    const applyPadding = () => map.setPadding(wide.matches ? { left: 320, right: 360, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 })
    applyPadding()
    wide.addEventListener('change', applyPadding)
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'switchpoint-popup' })
    map.on('style.load', () => {
      styleLens.current = pendingLens.current
      committedLens.current = pendingLens.current
      setMapError(null)
      setSwapping(false)
      if (lensStateRef.current) applyLens(map, lensStateRef.current)
    })
    const resizer = new ResizeObserver(() => map.resize())
    resizer.observe(container)
    map.on('load', () => setReady(true))
    // A style that fails to load reverts to the lens that last worked; a basemap
    // tile failure only says so. Panels keep working either way.
    map.on('error', (e) => {
      const err = e.error as { url?: string; status?: number } | undefined
      const styleFailed = Boolean(err?.url) && Object.values(STYLE_URL).includes(err?.url ?? '')
      const tileFailed = Boolean((e as { sourceId?: string }).sourceId) && (!err?.status || err.status >= 500)
      if (!styleFailed && !tileFailed) return
      setMapError("The map tiles didn't load. The static map and the table view still work.")
      // R10.1: a tile failure is not a dead end. Show the committed image once, unsolicited.
      if (pendingLens.current === 'heat' && !staticShown.current) {
        staticShown.current = true
        setStaticReason("The basemap tiles didn't load, so this is the same data as a still image.")
        setShowStatic(true)
      }
      if (!styleFailed) return
      setSwapping(false)
      const back = committedLens.current
      if (back && back !== pendingLens.current) {
        pendingLens.current = back
        styleLens.current = null
        setLens(back)
        map.setStyle(STYLE_URL[back], { diff: false })
      }
    })
    map.on('click', (e) => handlersRef.current.click(e))
    map.on('mousemove', (e) => handlersRef.current.move(e))
    map.on('mouseout', () => {
      hoverKey.current = null
      popupRef.current?.remove()
    })
    return () => {
      resizer.disconnect()
      wide.removeEventListener('change', applyPadding)
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current)
      hoverFrame.current = null
      popupRef.current?.remove()
      pinRef.current?.remove()
      pinRef.current = null
      map.remove()
      mapRef.current = null
      styleLens.current = null
      committedLens.current = null
      setReady(false)
    }
  }, [])

  const lensState = useMemo<LensState>(
    () => ({
      lens,
      towns,
      tracts,
      metric,
      colourBy,
      region,
      showSolar,
      showLabels,
      ejOn,
      heatMetric,
      heatYear,
      selectedKey,
      selectedTract,
    }),
    [lens, towns, tracts, metric, colourBy, region, showSolar, showLabels, ejOn, heatMetric, heatYear, selectedKey, selectedTract],
  )
  useEffect(() => {
    lensStateRef.current = lensState
    const map = mapRef.current
    if (map && ready && styleLens.current === lens) applyLens(map, lensState)
  }, [lensState, ready, lens])

  // ------------------------------------------------------------------ derived
  const energy = lens === 'energy'
  const yourKwh = profile.kwhIsExample || !(profile.kwh > 0) ? null : profile.kwh
  return (
    <div
      className="absolute inset-0 overflow-hidden [&_.maplibregl-ctrl-top-right]:top-[11rem] lg:[&_.maplibregl-ctrl-top-right]:top-3 lg:[&_.maplibregl-ctrl-top-right]:right-[360px]"
      style={{ background: LENS_BG[lens] }}
    >
      <div className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${swapping ? 'opacity-0' : 'opacity-100'}`}>
        {/* MapLibre sets position: relative on its container, so size it with height/width, not inset. */}
        <div ref={containerRef} className="h-full w-full" role="region" aria-label="Map of Massachusetts" />
      </div>

      {/* Left rail */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 max-h-[42%] lg:bottom-9 lg:max-h-none lg:w-[300px] lg:right-auto lg:inset-x-auto lg:left-3">
        <div className="pointer-events-auto flex max-h-full flex-col gap-3 overflow-y-auto rounded-card border border-rule bg-surface/95 p-4 shadow-sm backdrop-blur-sm lg:max-h-full">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            className="h-9 rounded-md border border-ink bg-ink px-3 text-small font-medium text-paper transition-colors hover:bg-ink-muted"
          >
            My home{profile.town ? ` · ${profile.town}` : ''}
          </button>

          <Search knownTown={selectedName ?? (profile.town || null)} initialQuery={profile.address || profile.town} townAt={townAt} onResult={onResult} onUseHome={onUseHome} />

          <div>
            <p className="text-micro font-medium text-ink" id="lens-label">
              Lens
            </p>
            <div role="group" aria-labelledby="lens-label" className="mt-1.5 grid grid-cols-2 rounded-md border border-rule-strong bg-paper p-0.5">
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={lens === l.id}
                  disabled={!ready && !(fallback && l.id === 'heat')}
                  onClick={() => changeLens(l.id)}
                  className="h-8 rounded text-small text-ink-muted transition-colors hover:text-ink disabled:opacity-50 aria-pressed:bg-ink aria-pressed:text-paper"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {lens === 'energy' ? <MetricControl metric={metric} onMetric={setMetric} /> : null}

          {lens === 'energy' && towns ? (
            <EnergyLegend
              metric={metric}
              max={metricMax(
                towns.entries.map((e) => e.energy),
                metric,
              )}
              meta={towns.baked._meta}
              colourBy={colourBy}
            />
          ) : null}

          {lens === 'energy' ? (
          <details className="group rounded-md border border-rule">
            <summary className="flex h-9 cursor-pointer list-none items-center justify-between px-3 text-small text-ink hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
              More map options
              <span aria-hidden className="text-ink-muted transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="border-t border-rule p-3">
              <EnergyOptions
                  region={region}
                  onRegion={(z) => {
                    setRegion(z)
                    camera.stopOrbit()
                    moveTo({ ...REGION_VIEW[z] }, 'ease')
                  }}
                  colourBy={colourBy}
                  onColourBy={setColourBy}
                  showSolar={showSolar}
                  onSolar={setShowSolar}
                  showLabels={showLabels}
                  onLabels={setShowLabels}
                  ready={ready}
                />
            </div>
          </details>
          ) : null}

          {lens === 'heat' ? (
            <>
              <HeatHeadline year={heatYear} dollars={headline(2027).dollars} />
              <HeatControls
                metric={heatMetric}
                onMetric={setHeatMetric}
                year={heatYear}
                onYear={setHeatYear}
                ejOn={ejOn}
                onEj={setEjOn}
                onTable={() => setShowTable(true)}
                onStatic={() => {
                  setStaticReason(null)
                  setShowStatic(true)
                }}
                tractsReady={tracts !== null}
              />
            </>
          ) : (
            <p className="text-micro text-ink-faint">Boundaries: US Census. Utilities: MassGIS Electricity Providers.</p>
          )}

          {dataError ? <p className="text-micro text-deadline" role="alert">{dataError}</p> : null}
          {mapError ? <p className="text-micro text-deadline" role="alert">{mapError}</p> : null}
        </div>
      </div>

      {/* Right panel */}
      <div className="pointer-events-none absolute inset-x-3 bottom-9 z-10 max-h-[40%] lg:inset-x-auto lg:bottom-9 lg:right-3 lg:top-3 lg:max-h-none lg:w-[340px]">
        <div className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-card border border-rule bg-surface/95 shadow-sm backdrop-blur-sm">
          <Tabs tab={tab} onTab={setTab} />
          <div
            role="tabpanel"
            id="panel-town"
            aria-labelledby="tab-town"
            tabIndex={0}
            hidden={tab !== 'town'}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {tab === 'town' ? (
              <TownPanel
                town={selectedName}
                tract={selectedTract}
                onClearTract={() => setSelectedTract(null)}
                energy={selectedEntry?.energy ?? null}
                meta={towns?.baked._meta ?? null}
                yourKwh={yourKwh}
                onEditProfile={() => setDrawerOpen(true)}
                backHref={query.back}
                lens={lens}
                ejOn={ejOn}
                year={heatYear}
              />
            ) : null}
          </div>
          <div
            role="tabpanel"
            id="panel-bill"
            aria-labelledby="tab-bill"
            tabIndex={0}
            hidden={tab !== 'bill'}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {tab === 'bill' ? <BillPanel profile={profile} onEditProfile={() => setDrawerOpen(true)} /> : null}
          </div>
        </div>
      </div>

      {/* Camera */}
      <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 hidden -translate-x-1/2 lg:block">
        <CameraControls camera={camera} ready={ready} onReset={resetView} />
      </div>

      {energy && towns ? (
        <p className="absolute left-3 hidden z-10 rounded-md bg-surface/95 px-2.5 py-1 text-micro text-ink-muted shadow-sm lg:block lg:left-1/2 lg:top-3 lg:-translate-x-1/2">
          {sourceLine(towns.baked._meta)}
        </p>
      ) : null}

      {lens === 'heat' ? (
        <>
          <HeatTable
            open={showTable}
            onClose={() => setShowTable(false)}
            year={heatYear}
            town={selectedKey}
            selected={selectedTract}
            onSelect={(geoid, townName) => {
              selectTract(geoid, townName ?? selectedName)
              setShowTable(false)
            }}
          />
          <HeatStatic
            open={showStatic}
            reason={staticReason}
            onClose={() => setShowStatic(false)}
            onTable={() => {
              setShowStatic(false)
              setShowTable(true)
            }}
          />
        </>
      ) : null}

      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} profile={profile} onChange={update} onClear={clear} />
    </div>
  )
}

// ---------------------------------------------------------------------- pieces

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'town', label: 'Town' },
    { id: 'bill', label: 'Your bill' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Panel"
      className="grid grid-cols-2 border-b border-rule"
      onKeyDown={(e) => {
        const i = tabs.findIndex((t) => t.id === tab)
        const n = tabs.length
        const next =
          e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
        if (next < 0) return
        e.preventDefault()
        onTab(tabs[next].id)
        requestAnimationFrame(() => document.getElementById(`tab-${tabs[next].id}`)?.focus())
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={tab === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          className="h-10 border-b-2 border-transparent text-small text-ink-muted transition-colors hover:text-ink aria-selected:border-ink aria-selected:font-medium aria-selected:text-ink"
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

const CHIP =
  'h-8 rounded-md border border-rule-strong bg-surface px-2.5 text-micro text-ink transition-colors hover:bg-paper-sunk aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper'

function MetricControl({ metric, onMetric }: { metric: Metric; onMetric: (m: Metric) => void }) {
  const metrics = Object.keys(METRIC_LABEL) as Metric[]
  return (
    <div>
      <p className="text-micro font-medium text-ink">Metric</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {metrics.map((m) => (
          <button key={m} type="button" className={CHIP} aria-pressed={metric === m} onClick={() => onMetric(m)}>
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  )
}

function EnergyOptions(props: {
  region: Zone | 'ALL'
  onRegion: (z: Zone | 'ALL') => void
  colourBy: 'provider' | 'intensity'
  onColourBy: (c: 'provider' | 'intensity') => void
  showSolar: boolean
  onSolar: (b: boolean) => void
  showLabels: boolean
  onLabels: (b: boolean) => void
  ready: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="region" className="text-micro font-medium text-ink">
          Region (ISO-NE load zone)
        </label>
        <select
          id="region"
          value={props.region}
          disabled={!props.ready}
          onChange={(e) => props.onRegion(e.target.value as Zone | 'ALL')}
          className="mt-1.5 h-9 w-full rounded-md border border-rule-strong bg-surface px-2 text-small text-ink"
        >
          {(Object.keys(ZONE_LABEL) as (Zone | 'ALL')[]).map((z) => (
            <option key={z} value={z}>
              {ZONE_LABEL[z]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="text-micro font-medium text-ink">Colour by</p>
        <div className="mt-1.5 flex gap-1.5">
          {(['provider', 'intensity'] as const).map((c) => (
            <button key={c} type="button" className={CHIP} aria-pressed={props.colourBy === c} onClick={() => props.onColourBy(c)}>
              {c === 'provider' ? 'Provider' : 'Intensity'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-micro text-ink">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={props.showSolar} onChange={(e) => props.onSolar(e.target.checked)} /> Solar capacity
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={props.showLabels} onChange={(e) => props.onLabels(e.target.checked)} /> Town labels
        </label>
      </div>
    </div>
  )
}
