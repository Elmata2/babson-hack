import type { ContactsBlock } from '@/lib/verdict/contacts'

const ANCHOR = 'underline decoration-rule-strong underline-offset-4 hover:text-ink'

export function ContactsList({ block }: { block: ContactsBlock }) {
  return (
    <div className="mt-4 border-t border-rule pt-4">
      <h3 className="text-small font-medium">Your current setup, and who to contact</h3>
      <p className="mt-1 text-small text-ink-muted">{block.now}</p>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-small">
        {block.items.map((entry) => (
          <li key={entry.title}>
            <span className="font-medium">{entry.title}.</span>{' '}
            {entry.phone ? (
              <a href={entry.phone.href} className={ANCHOR}>
                {entry.phone.display}
              </a>
            ) : null}
            {entry.phone && entry.links.length ? ' · ' : null}
            {entry.links.map((link, index) => (
              <span key={link.href}>
                {index > 0 ? ' · ' : null}
                <a href={link.href} target="_blank" rel="noopener noreferrer" className={ANCHOR}>
                  {link.label}
                </a>
              </span>
            ))}
            {entry.detail ? <span className="block text-ink-muted">{entry.detail}</span> : null}
            {entry.sources.length ? (
              <span className="block text-micro text-ink-faint">
                Source: {entry.sources.map((source) => `${source.text}, read ${source.readOn}`).join('; ')}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
