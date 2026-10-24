import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { MapLoader } from '@/components/map/map-loader'

/**
 * @built F-41 /map route: header plus a full-height map area
 *
 * The map itself is a client-only dynamic import (see `map-loader.tsx`).
 */

export const metadata: Metadata = { title: 'Map' }

export default function MapPage() {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="relative min-h-0 flex-1">
        <MapLoader />
      </main>
    </div>
  )
}
