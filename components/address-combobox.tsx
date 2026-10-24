'use client'

import { useEffect, useId, useRef, useState } from 'react'

import type { AddressSuggestion } from '@/lib/address/nominatim'

/**
 * @built F-64 address type-ahead — every Chandler Street in the state, not one guess
 *
 * The Census geocoder can only answer "where is this address". This is the other
 * question: "which one is mine?" Typing four characters asks OpenStreetMap for
 * every Massachusetts match and lists them with their town, so the person picks
 * their house instead of accepting a silent best guess.
 *
 * Accessibility: a real ARIA combobox with a listbox, `aria-activedescendant`,
 * arrow keys, Enter to pick, Escape to dismiss. The attribution is inside the
 * list because the licence requires it where the data is shown.
 */

const MIN_CHARS = 4
const DEBOUNCE_MS = 320

interface AddressState {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  message: string | null
}

export interface AddressComboboxProps {
  onSelect: (suggestion: AddressSuggestion) => void
  /** Resolve a typed address the dropdown did not list. */
  onTyped?: (value: string) => void
  placeholder?: string
  /**
   * An address already chosen elsewhere — on the map, for instance (R10.6). It is
   * put in the field without a lookup: the household selected this house, so asking
   * OpenStreetMap to search for it again would be a request nobody asked for.
   */
  initialValue?: string
}

export function AddressCombobox({ onSelect, onTyped, placeholder, initialValue }: AddressComboboxProps) {
  const [value, setValue] = useState(initialValue ?? '')
  const [items, setItems] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [state, setState] = useState<AddressState>({ status: 'idle', message: null })
  const listboxId = useId()
  // Consumed once by the first effect run, so an initial value never triggers a search.
  const picked = useRef(Boolean(initialValue))
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    if (picked.current) {
      picked.current = false
      return
    }
    const query = value.trim()
    if (query.length < MIN_CHARS) return

    controller.current?.abort()
    const next = new AbortController()
    controller.current = next

    const timer = setTimeout(async () => {
      setState({ status: 'loading', message: null })
      try {
        const response = await fetch(`/api/address?q=${encodeURIComponent(query)}`, { signal: next.signal })
        const payload = (await response.json()) as {
          ok: boolean
          results?: AddressSuggestion[]
          message?: string
        }
        if (next.signal.aborted) return
        if (!payload.ok) {
          setItems([])
          setOpen(false)
          setState({ status: 'error', message: payload.message ?? 'The address search is unavailable.' })
          return
        }
        const results = payload.results ?? []
        setItems(results)
        setActive(-1)
        setOpen(results.length > 0)
        setState(
          results.length === 0
            ? { status: 'empty', message: 'No Massachusetts match. Pick your town below, or use the address as typed.' }
            : { status: 'ready', message: null },
        )
      } catch {
        if (next.signal.aborted) return
        setItems([])
        setOpen(false)
        setState({ status: 'error', message: 'The address search is unreachable. Pick your town below instead.' })
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [value])

  function pick(suggestion: AddressSuggestion) {
    picked.current = true
    setValue(suggestion.label)
    setItems([])
    setOpen(false)
    setActive(-1)
    setState({ status: 'idle', message: null })
    onSelect(suggestion)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || items.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      const chosen = items[active]
      if (chosen) {
        event.preventDefault()
        pick(chosen)
      }
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="address">
        Street address, town and ZIP
      </label>
      <input
        id="address"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listboxId}-option-${active}` : undefined}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          setValue(nextValue)
          if (nextValue.trim().length < MIN_CHARS) {
            setItems([])
            setOpen(false)
            setActive(-1)
            setState({ status: 'idle', message: null })
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (items.length > 0) setOpen(true)
        }}
        onBlur={() => {
          // A short delay lets a click on a row land before the list unmounts.
          setTimeout(() => setOpen(false), 140)
        }}
        placeholder={placeholder ?? 'Start typing: e.g. 106 Chandler St'}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-card border border-rule-strong bg-surface px-3 py-2.5 pr-10 text-body placeholder:text-ink-faint"
      />

      <span
        aria-hidden
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint ${
          state.status === 'loading' ? 'animate-pulse' : ''
        }`}
      >
        {state.status === 'loading' ? '···' : '⌕'}
      </span>

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Massachusetts addresses"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-card border border-rule-strong bg-surface shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]"
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault()
                pick(item)
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer border-b border-rule/70 px-3 py-2.5 last:border-b-0 ${
                index === active ? 'bg-paper-sunk' : 'bg-surface'
              }`}
            >
              <span className="block text-small text-ink">{item.line1}</span>
              <span className="block text-micro text-ink-muted">
                {[item.town, item.postcode ? `MA ${item.postcode}` : 'Massachusetts'].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
          <li role="presentation" className="border-t border-rule px-3 py-1.5 text-[11px] text-ink-faint">
            Address search © OpenStreetMap contributors
          </li>
        </ul>
      ) : null}

      {state.message ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-micro text-deadline">{state.message}</p>
          {onTyped && value.trim().length >= 6 ? (
            <button
              type="button"
              onClick={() => onTyped(value.trim())}
              className="rounded-pill border border-rule-strong px-2 py-0.5 text-micro text-ink-muted hover:border-ink hover:text-ink"
            >
              Use this address as typed
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
