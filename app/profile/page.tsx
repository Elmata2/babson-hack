import type { Metadata } from 'next'

import { ProfileSummary } from '@/components/profile/profile-summary'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { demoFromParams } from '@/lib/demo'

/**
 * `/profile` — what this browser remembers, and the way back to the verdict.
 * The page is static; the summary reads localStorage after mount, so nothing about
 * the household is rendered on a server.
 */

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
}

interface ProfilePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const demo = demoFromParams(await searchParams)

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader demo={demo} />
      <main id="main" className="band-wash flex-1">
        <div className="mx-auto max-w-[760px] px-5 py-14 sm:px-8 sm:py-20">
          <h1 className="text-balance text-headline font-medium">Your profile</h1>
          <div className="mt-10">
            <ProfileSummary demo={demo} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
