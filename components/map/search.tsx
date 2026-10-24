'use client'

/**
 * @built F-70 one search box: town typeahead, 5-digit ZIP, street address
 *
 * - Town: local prefix-then-substring match over the 351 towns.
 * - ZIP: local lookup in the baked ZCTA table, no network.
 * - Address: `/api/geocode` (the Census geocoder, server side). The address is the
 *   only PII in the app; it is never logged here and never kept beyond the profile
 *   the user explicitly saves.
 * A request id drops any response that is no longer the latest.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { demoFromLocation } from '@/lib/demo'
import { ALL_TOWNS } from '@/lib/utility'
import { displayTown } from '@/lib/geo'
import { intakeHrefForAddress } from '@/lib/intake/params'
import { isZip, lookupZip } from '@/lib/map/zip'

export type SearchResult =
  | { kind: 'town'; town: string }
  | { kind: 'zip'; town: string; lon: number; lat: number; zip: string }
  | { kind: 'address'; town: string; lon: number; lat: number; address: string }

interface Props {
  /** Town currently selected or saved as home, to detect a ZIP that spans towns. */
  knownTown: string | null
  /** Shown in the field until the reader types: the profile address, or the town. */
  initialQuery?: string
  /** Point-in-polygon fallback when the geocoder returns a town we don't know. */
  townAt: (lon: number, lat: number) => string | null
  onResult: (result: SearchResult) => void
  onUseHome: (result: SearchResult) => void
}

interface Status {
  tone: 'info' | 'error'
  text: string
}

const TIMEOUT_MS = 8000

interface GeocodeOk {
  ok: true
  matchedAddress: string
  lat: number
  lon: number
  town: string | null
  townKnown: boolean
}

export function suggestTowns(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q || /\d/.test(q)) return []
  const starts = ALL_TOWNS.filter((t) => t.toLowerCase().startsWith(q))
  const contains = ALL_TOWNS.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, 6)
}

export function Search({ knownTown, initialQuery = '', townAt, onResult, onUseHome }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [typed, setQuery] = useState<string | null>(null)
  const query = typed ?? initialQuery
  const [matches, setMatches] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<Status | null>(null)
  const [found, setFound] = useState<SearchResult | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const abort = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    requestId.current++
    abort.current?.abort()
    abort.current = null
    setBusy(false)
  }, [])

  useEffect(() => () => {
    requestId.current++
    abort.current?.abort()
  }, [])

  const finish = useCallback(
    (result: SearchResult, text: string | null) => {
      setMatches([])
      setActive(-1)
      setFound(result)
      setSaved(false)
      // R10.6: the field keeps the address the geocoder matched, not the fragment
      // that was typed, so the map's own address field is prefilled with the parcel
      // the pin is standing on.
      if (result.kind === 'address') setQuery(result.address)
      setStatus(text ? { tone: 'info', text } : null)
      onResult(result)
    },
    [onResult],
  )

  const pickTown = (town: string) => {
    cancel()
    setQuery(town)
    finish({ kind: 'town', town }, null)
  }

  const lookupAddress = async (q: string) => {
    cancel()
    const my = ++requestId.current
    const ctrl = new AbortController()
    abort.current = ctrl
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    setBusy(true)
    setFound(null)
    setStatus({ tone: 'info', text: 'Looking up address…' })
    const fail = () => {
      if (my !== requestId.current) return
      setBusy(false)
      setFound(null)
      setStatus({ tone: 'error', text: "We couldn't find that address. Pick your town instead." })
    }
    try {
      // R13.1: the demo flag travels with the request, so the route refuses
      // instead of calling the Census geocoder. The town list is the fallback.
      const demo = demoFromLocation() ? '&demo=1' : ''
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${demo}`, { signal: ctrl.signal })
      const body = (await res.json()) as GeocodeOk | { ok: false }
      if (my !== requestId.current) return
      if (!res.ok || !body.ok) return fail()
      const town = body.townKnown && body.town ? body.town : townAt(body.lon, body.lat)
      if (!town) return fail()
      setBusy(false)
      finish({ kind: 'address', town: displayTown(town), lon: body.lon, lat: body.lat, address: body.matchedAddress }, null)
    } catch {
      fail()
    } finally {
      clearTimeout(timer)
    }
  }

  const submit = () => {
    const q = query.trim()
    if (!q) return
    if (active >= 0 && matches[active]) return pickTown(matches[active])
    if (isZip(q)) {
      cancel()
      const hit = lookupZip(q)
      if (!hit) {
        setFound(null)
        setStatus({ tone: 'error', text: "That ZIP isn't in our Massachusetts list. Try your town or street address." })
        return
      }
      const town = displayTown(hit.town)
      const spans = knownTown !== null && knownTown !== town
      finish(
        { kind: 'zip', town, lon: hit.lon, lat: hit.lat, zip: hit.zip },
        spans ? `This ZIP's centre is in ${town}. If you live in a neighbouring town, search for it by name.` : null,
      )
      return
    }
    if (/\d/.test(q)) return void lookupAddress(q)
    const exact = ALL_TOWNS.find((t) => t.toLowerCase() === q.toLowerCase())
    if (exact) return pickTown(exact)
    if (matches.length === 1) return pickTown(matches[0])
    setFound(null)
    setStatus({ tone: 'error', text: "We couldn't find that town. Pick one from the list." })
  }

  const onChange = (value: string) => {
    cancel()
    setQuery(value)
    setMatches(suggestTowns(value))
    setActive(-1)
    setFound(null)
    setSaved(false)
    setStatus(/\d/.test(value) && !isZip(value) ? { tone: 'info', text: 'Press Enter to look up this address.' } : null)
  }

  const open = matches.length > 0
  return (
    <div>
      <label htmlFor={`${id}-input`} className="text-micro font-medium text-ink">
        Search a town, ZIP or address
      </label>
      <div className="relative mt-1.5">
        <div className="flex gap-1.5">
          <input
            id={`${id}-input`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
            autoComplete="off"
            placeholder="Wellesley, 02482, or 1 Main St"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setMatches([])}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && open) {
                e.preventDefault()
                setActive((active + 1) % matches.length)
              } else if (e.key === 'ArrowUp' && open) {
                e.preventDefault()
                setActive((active - 1 + matches.length) % matches.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                setMatches([])
                setActive(-1)
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-md border border-rule-strong bg-surface px-2.5 text-small text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-9 rounded-md border border-rule-strong bg-surface px-3 text-small text-ink transition-colors hover:bg-paper-sunk disabled:opacity-50"
          >
            Go
          </button>
        </div>
        <ul
          id={listId}
          role="listbox"
          hidden={!open}
          className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-rule bg-surface p-1 shadow-md"
        >
          {matches.map((town, i) => (
            <li
              key={town}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pickTown(town)
              }}
              className="cursor-pointer rounded px-2 py-1.5 text-small text-ink aria-selected:bg-paper-sunk hover:bg-paper-sunk"
            >
              {town}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-1 text-micro text-ink-faint">Addresses go to the US Census geocoder. Map tiles load from CARTO and OpenFreeMap for the area you view.</p>
      <div role="status" aria-live="polite" className="mt-1.5 min-h-0 text-micro">
        {status ? <p className={status.tone === 'error' ? 'text-deadline' : 'text-ink-muted'}>{status.text}</p> : null}
        {found && !busy ? (
          <p className="mt-1 text-ink-muted">
            Found <strong className="font-medium text-ink">{found.town}</strong>
            {found.kind === 'address' ? ` · ${found.address}` : found.kind === 'zip' ? ` · ZIP ${found.zip}` : ''}
            {saved ? (
              <span className="ml-2 text-switch">Saved as your home, in this browser only.</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onUseHome(found)
                  setSaved(true)
                }}
                className="ml-2 rounded-md border border-rule-strong bg-surface px-2 py-0.5 text-ink hover:bg-paper-sunk"
              >
                Use as my home
              </button>
            )}
            {found.kind === 'address' ? (
              <a
                href={intakeHrefForAddress(found.town, found.address)}
                className="ml-2 rounded-md border border-rule-strong bg-surface px-2 py-0.5 text-ink hover:bg-paper-sunk"
              >
                Open in the calculator
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  )
}
