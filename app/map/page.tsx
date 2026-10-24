import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { MapLoader } from '@/components/map/map-loader'
import { demoFromParams } from '@/lib/demo'

/**
 * @built F-41 /map route: header plus a full-height map area
 *
 * The map itself is a client-only dynamic import (see `map-loader.tsx`).
 */

export const metadata: Metadata = { title: 'Map' }

interface MapPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const demo = demoFromParams(await searchParams)

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader demo={demo} />
      <main id="main" className="relative min-h-0 flex-1">
        <MapLoader />
      </main>
    </div>
  )
}
