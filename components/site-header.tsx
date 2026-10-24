import Link from 'next/link'

import { HeaderShell } from '@/components/motion/header-shell'
import { withDemo } from '@/lib/demo'

/*
 * Site header — wordmark and one profile button. Sticky, hairline-bordered, and
 * deliberately thin: the page belongs to the verdict, not to chrome.
 *
 * @built F-49 the optional `demo` prop keeps `?demo=1` on the wordmark and the
 * in-app links. Without it, clicking the logo on a demo page would silently
 * return to the live price reader.
 */

export function SiteHeader({ demo = false, quietAtTop = false }: { demo?: boolean; quietAtTop?: boolean }) {
  return (
    <HeaderShell quietAtTop={quietAtTop}>
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-6 px-5 sm:h-16 sm:px-8">
        <Link
          href={withDemo('/', demo)}
          className="group inline-flex items-center gap-2.5 rounded-sm"
          aria-label="Switchpoint, home"
        >
          <Mark className="h-5 w-5 text-ink" />
          <span className="text-small font-medium tracking-[-0.01em]">Switchpoint</span>
        </Link>

        <Link
          href={withDemo('/onboarding', demo)}
          aria-label="Your profile"
          className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-rule-strong text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <ProfileIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </HeaderShell>
  )
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.7-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  )
}

/** Two states and the point where one becomes the other. */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M4 20 12 12l8 8" opacity="0.45" />
      <path d="M4 4h4.5L20 15.5V20" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
