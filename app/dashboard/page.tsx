import type { Metadata } from 'next'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { DashboardView } from '@/components/switch/dashboard-view'
import { demoFromParams } from '@/lib/demo'

/**
 * @built F-150 `/dashboard` shell — Addendum B §3.7, the tab-scoped version
 * @built F-49 `?demo=1` is passed into the client view so every link it builds
 * keeps the flag; the page itself has no server fetch
 *
 * Server chrome, client data: the profile and the switch request are read from the
 * browser, so there is nothing to fetch on the server and nothing to leak.
 */

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your home, the switch request you approved, and the deadlines that move the answer.',
  robots: { index: false, follow: false },
}

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const demo = demoFromParams(await searchParams)

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} showDashboard={false} />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
          <DashboardView demo={demo} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
