import Link from 'next/link'

import { HeaderShell } from '@/components/motion/header-shell'
import { ProfileLink } from '@/components/profile/profile-link'
import { withDemo } from '@/lib/demo'

/*
 * Site header — wordmark, the way in, and a profile button that appears only once
 * a household has finished the profile (see `lib/profile/completion`). Sticky,
 * hairline-bordered, deliberately thin: the page belongs to the verdict, not to
 * chrome.
 *
 * The "Get my verdict" pill is on every page that is not itself the wizard, so a
 * reader who lands on the map or a shared verdict never has to scroll back to
 * find the door.
 *
 * @built F-49 the optional `demo` prop keeps `?demo=1` on the wordmark and the
 * in-app links. Without it, clicking the logo on a demo page would silently
 * return to the live price reader.
 */

export function SiteHeader({
  demo = false,
  quietAtTop = false,
  cta = true,
}: {
  demo?: boolean
  quietAtTop?: boolean
  /** Off on `/onboarding`, where the pill would only link to the page you are on. */
  cta?: boolean
}) {
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

        <div className="flex items-center gap-2.5">
          {cta ? (
            <Link
              href={withDemo('/onboarding', demo)}
              className="group inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-small font-medium text-paper shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] transition-[translate,scale,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-14px_rgba(0,0,0,0.6)] active:scale-[0.97]"
            >
              <span className="hidden sm:inline">Get my verdict</span>
              <span className="sm:hidden">Get verdict</span>
              <span
                aria-hidden
                className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          ) : null}
          <ProfileLink demo={demo} />
        </div>
      </div>
    </HeaderShell>
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
