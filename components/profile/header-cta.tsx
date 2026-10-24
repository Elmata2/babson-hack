'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { useCompletedProfile } from '@/components/profile/profile-link'
import { withDemo } from '@/lib/demo'
import { verdictHref } from '@/lib/profile/completion'
import { readStoredSwitch, serverSwitchSnapshot, subscribeSwitch, switchSnapshot } from '@/lib/switch/session'
import { verdictPath } from '@/lib/verdict/share-query'

/**
 * The header's one action. Before a profile it is the way in; after a verdict it
 * is the way back to the answer the browser already holds, so the page never
 * pretends the household has not answered the question yet.
 */
export function HeaderCta({ demo = false }: { demo?: boolean }) {
  const completed = useCompletedProfile()
  const requestRaw = useSyncExternalStore(subscribeSwitch, switchSnapshot, serverSwitchSnapshot)
  const request = readStoredSwitch(requestRaw)

  const href = request
    ? verdictPath(request.query)
    : completed
      ? verdictHref(completed) ?? '/onboarding'
      : '/onboarding'
  const answered = Boolean(request || completed)

  return (
    <Link
      href={withDemo(href, demo)}
      className="group inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-small font-medium text-paper shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] transition-[translate,scale,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-14px_rgba(0,0,0,0.6)] active:scale-[0.97]"
    >
      <span className="hidden sm:inline">{answered ? 'Your verdict' : 'Get my verdict'}</span>
      <span className="sm:hidden">{answered ? 'Verdict' : 'Get verdict'}</span>
      <span aria-hidden className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}
