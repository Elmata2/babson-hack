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

export function useCompletedProfile() {
  const raw = useSyncExternalStore(subscribeCompletion, completionSnapshot, serverCompletionSnapshot)
  return readCompleted(raw)
}

export function ProfileLink({ demo = false }: { demo?: boolean }) {
  const completed = useCompletedProfile()

  if (!completed) return null

  return (
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
  )
}
