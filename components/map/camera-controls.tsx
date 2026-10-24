'use client'

/**
 * @built F-71 camera cluster: rotate ±45°, tilt ±15°, Orbit, Reset view
 *
 * Orbit nudges the bearing every frame with `{ orbit: true }` as event data, so the
 * stop handler can tell its own movement from the user's. Any pointer, wheel or key
 * input on the map stops it. Disabled under prefers-reduced-motion, as is the
 * continuous spin itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface CameraApi {
  orbiting: boolean
  stopOrbit: () => void
  toggleOrbit: () => void
  rotate: (deg: number) => void
  tilt: (deg: number) => void
}

export function useCamera(getMap: () => MlMap | null, ready: boolean): CameraApi {
  const [orbiting, setOrbiting] = useState(false)
  const frame = useRef<number | null>(null)
  const last = useRef(0)

  const stopOrbit = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    setOrbiting(false)
  }, [])

  const toggleOrbit = useCallback(() => {
    if (!getMap() || prefersReducedMotion()) return
    if (frame.current !== null) return stopOrbit()
    function tick(t: number) {
      const map = getMap()
      if (!map || frame.current === null) return
      map.setBearing(map.getBearing() + (6 * Math.min(t - last.current, 100)) / 1000, { orbit: true })
      last.current = t
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame((t) => {
      last.current = t
      tick(t)
    })
    setOrbiting(true)
  }, [getMap, stopOrbit])

  // User input on the map ends the orbit. Our own setBearing carries `orbit: true`.
  useEffect(() => {
    const map = getMap()
    if (!map || !ready) return
    const el = map.getContainer()
    const stop = () => stopOrbit()
    const events = ['mousedown', 'touchstart', 'wheel', 'keydown'] as const
    for (const ev of events) el.addEventListener(ev, stop, true)
    const onMove = (e: { orbit?: boolean }) => {
      if (!e.orbit) stopOrbit()
    }
    for (const ev of ['dragstart', 'rotatestart', 'pitchstart'] as const) map.on(ev, onMove)
    return () => {
      for (const ev of events) el.removeEventListener(ev, stop, true)
      for (const ev of ['dragstart', 'rotatestart', 'pitchstart'] as const) map.off(ev, onMove)
    }
  }, [getMap, ready, stopOrbit])

  useEffect(() => stopOrbit, [stopOrbit])

  const rotate = useCallback(
    (deg: number) => {
      const map = getMap()
      if (!map) return
      stopOrbit()
      map.easeTo({ bearing: map.getBearing() + deg, duration: prefersReducedMotion() ? 0 : 500 })
    },
    [getMap, stopOrbit],
  )
  const tilt = useCallback(
    (deg: number) => {
      const map = getMap()
      if (!map) return
      stopOrbit()
      map.easeTo({ pitch: Math.min(85, Math.max(0, map.getPitch() + deg)), duration: prefersReducedMotion() ? 0 : 500 })
    },
    [getMap, stopOrbit],
  )

  return { orbiting, stopOrbit, toggleOrbit, rotate, tilt }
}

const BTN =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-micro text-ink transition-colors hover:bg-paper-sunk disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-ink aria-pressed:text-paper'

export function CameraControls({
  camera,
  ready,
  onReset,
}: {
  camera: CameraApi
  ready: boolean
  onReset: () => void
}) {
  const reduced = prefersReducedMotion()
  return (
    <div
      role="group"
      aria-label="Camera"
      className="pointer-events-auto flex items-center gap-0.5 rounded-card border border-rule bg-surface/95 p-1 shadow-sm backdrop-blur-sm"
    >
      <button type="button" className={BTN} disabled={!ready} onClick={() => camera.rotate(-45)} aria-label="Rotate 45 degrees left">
        ⟲ 45°
      </button>
      <button type="button" className={BTN} disabled={!ready} onClick={() => camera.rotate(45)} aria-label="Rotate 45 degrees right">
        45° ⟳
      </button>
      <button type="button" className={BTN} disabled={!ready} onClick={() => camera.tilt(-15)} aria-label="Tilt up 15 degrees">
        Tilt ▲
      </button>
      <button type="button" className={BTN} disabled={!ready} onClick={() => camera.tilt(15)} aria-label="Tilt down 15 degrees">
        Tilt ▼
      </button>
      <button
        type="button"
        className={BTN}
        disabled={!ready || reduced}
        aria-pressed={camera.orbiting}
        onClick={camera.toggleOrbit}
        title={reduced ? 'Disabled: reduced motion is on' : 'Slowly rotate the view'}
      >
        Orbit
      </button>
      <button type="button" className={BTN} disabled={!ready} onClick={onReset}>
        Reset view
      </button>
    </div>
  )
}
