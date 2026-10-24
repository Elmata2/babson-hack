'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { withDemo } from '@/lib/demo'
import {
  completionSnapshot,
  readCompleted,
  serverCompletionSnapshot,
  subscribeCompletion,
} from '@/lib/profile/completion'
import { readStoredSwitch, serverSwitchSnapshot, subscribeSwitch, switchSnapshot } from '@/lib/switch/session'

export function useCompletedProfile() {
  const raw = useSyncExternalStore(subscribeCompletion, completionSnapshot, serverCompletionSnapshot)
  return readCompleted(raw)
}

/**
 * The avatar, plus the way back to the dashboard once this tab has a request.
 * Before that there is nothing to dashboard, so the extra link is not shown.
 */
export function ProfileLink({ demo = false, showDashboard = true }: { demo?: boolean; showDashboard?: boolean }) {
  const completed = useCompletedProfile()
  const requestRaw = useSyncExternalStore(subscribeSwitch, switchSnapshot, serverSwitchSnapshot)
  const hasRequest = readStoredSwitch(requestRaw) !== null

  if (!completed && !hasRequest) return null

  return (
    <div className="flex items-center gap-3">
      {showDashboard && (hasRequest || completed) ? (
        <Link
          href={withDemo('/dashboard', demo)}
          className="hidden text-small text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink sm:inline"
        >
          Dashboard
        </Link>
      ) : null}
      {completed ? (
        <Link
          href={withDemo('/profile', demo)}
          aria-label="Your profile"
          className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-rule-strong text-ink transition-[background-color,color,scale] duration-200 ease-out-expo hover:bg-ink hover:text-paper active:scale-[0.96]"
        >
          <svg aria-hidden className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 20c.8-3.6 3.7-5.5 7-5.5s6.2 1.9 7 5.5" />
          </svg>
        </Link>
      ) : null}
    </div>
  )
}
