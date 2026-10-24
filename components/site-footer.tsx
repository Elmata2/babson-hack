import { DISCLAIMER } from '@/lib/verdict/disclaimer'

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-6 text-micro text-ink-muted sm:px-8">
        <p>
          <span className="font-medium text-ink">Switchpoint</span>
          <span aria-hidden className="mx-2 text-ink-faint">/</span>
          {DISCLAIMER}
        </p>
        <a
          href="https://github.com/Elmata2/babson-hack/blob/master/BUILDLOG.md"
          target="_blank"
          rel="noreferrer"
          className="rounded-sm underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
        >
          Build log
        </a>
      </div>
    </footer>
  )
}
