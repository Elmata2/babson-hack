import Link from 'next/link'

/*
 * Site header — wordmark, scope, source link. Sticky, hairline-bordered, and
 * deliberately thin: the page belongs to the verdict, not to chrome.
 */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-6 px-5 sm:h-16 sm:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 rounded-sm"
          aria-label="Switchpoint, home"
        >
          <Mark className="h-5 w-5 text-ink" />
          <span className="text-small font-medium tracking-[-0.01em]">Switchpoint</span>
        </Link>

        <div className="flex items-center gap-4 text-micro text-ink-muted">
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="num text-ink">351</span>
            <span>Massachusetts towns</span>
          </span>
          <span aria-hidden className="hidden h-3 w-px bg-rule-strong sm:block" />
          <a
            href="https://github.com/Elmata2/babson-hack"
            className="rounded-sm underline decoration-rule-strong decoration-1 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
            rel="noreferrer"
            target="_blank"
          >
            Source
          </a>
        </div>
      </div>
    </header>
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
