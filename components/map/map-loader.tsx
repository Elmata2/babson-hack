'use client'

/**
 * @built F-41 client-side loader for the map
 *
 * `next/dynamic` with `ssr: false` is only allowed in a client component, so the
 * server page renders this thin wrapper. MapLibre needs `window` and WebGL.
 */

import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-paper-sunk text-small text-ink-muted" role="status">
      Loading the map…
    </div>
  ),
})

export function MapLoader() {
  return <MapView />
}
