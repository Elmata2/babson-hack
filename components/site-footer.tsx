/*
 * Site footer — disclaimer, privacy, provenance links.
 *
 * The disclaimer is not legal boilerplate in small type at the bottom of a
 * settings page; it is part of the product. It stays visible.
 */

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper-sunk">
      <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="max-w-[46ch] text-small text-ink">
              Estimate only. Not a quote. A Home Energy Assessment determines eligibility and
              sizing.
            </p>
            <p className="mt-3 max-w-[46ch] text-micro text-ink-muted">
              No accounts. No stored addresses. Bill images are parsed in memory and discarded.
            </p>
          </div>

          <div>
            <p className="text-eyebrow uppercase text-ink-faint">Build</p>
            <ul className="mt-3 space-y-2 text-small">
              <FooterLink href="https://github.com/Elmata2/babson-hack/blob/master/BUILDLOG.md">
                Build log
              </FooterLink>
              <FooterLink href="https://github.com/Elmata2/babson-hack/tree/master/.kiro">
                Spec and steering
              </FooterLink>
              <FooterLink href="https://hackachusetts2026.vercel.app/">
                Organizer datasets
              </FooterLink>
            </ul>
          </div>

          <div>
            <p className="text-eyebrow uppercase text-ink-faint">Built at</p>
            <p className="mt-3 text-small text-ink-muted">
              Hackachusetts 2026
              <br />
              Babson hub, Weissman Foundry
              <br />
              Climate Tech, challenge C2
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="rounded-sm text-ink-muted underline decoration-rule-strong decoration-1 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
      >
        {children}
      </a>
    </li>
  )
}
