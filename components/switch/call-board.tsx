'use client'

/**
 * @built F-127 the call board — live status, a ranked table, and the sentence behind
 *   every number
 * @built F-128 "Use this price" writes the effective price back into the verdict
 * @built F-129 `?demo=1` stages three conversations from fixtures, with no network
 * @built F-130 the one negotiation round, offered only when two quotes are ranked
 *
 * Two paths, one component:
 *
 *   demo  — the fixtures are stepped through locally by a clock, because R13.1 says
 *           `?demo=1` opens no socket at all. Nothing here fetches when `demo` is true.
 *   live  — POST /api/calls, then poll the ids the browser now holds (ADR-010) every
 *           three seconds until every row is finished, then stop. On unmount the
 *           conversations are deleted with a keepalive request (R22.2).
 *
 * The ranking is not done here: `buildBoard` is pure and tested, and this component
 * only renders its answer. That is deliberate — a number that is sorted in a
 * component is a number nobody can test.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildBoard, type CallBoard as Board } from '@/lib/calls/board'
import { demoDurationMs, fixtureRecord, isDemoConversationId } from '@/lib/calls/fixtures'
import type { CallMode, CallPoll, CallRecord, CallStart } from '@/lib/calls/types'
import type { SharedFacts, SwitchChoice, SwitchProvider } from '@/lib/switch/types'
import { withDemo } from '@/lib/demo'
import { withUnitPrice } from '@/lib/intake/params'

const POLL_MS = 3_000
const DEMO_TICK_MS = 400
const MAX_ELAPSED = 120_000

const STATUS_COPY: Record<string, string> = {
  queued: 'Queued',
  scheduled: 'Scheduled',
  sent: 'Sent',
  ringing: 'Ringing',
  in_progress: 'Talking',
  done: 'Done',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  declined: 'Declined',
  failed: 'Failed',
  unsupported: 'Not placed',
}

function statusTone(status: string): string {
  if (status === 'done') return 'border-moss-edge bg-moss-tint text-ink'
  if (status === 'failed' || status === 'declined' || status === 'no_answer') return 'border-deadline-edge bg-deadline-tint text-ink'
  if (status === 'ringing' || status === 'in_progress') return 'border-switch-edge bg-switch-tint text-ink'
  return 'border-rule-strong bg-paper-sunk text-ink-muted'
}

function money(value: number | null, suffix = ''): string {
  if (value === null) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`
}

export interface CallBoardProps {
  mode: CallMode
  /** The decision the household consented to; the route checks it against each row. */
  choice: SwitchChoice
  kind: 'fuel' | 'installer'
  providers: SwitchProvider[]
  facts: SharedFacts
  usage: {
    annualGallons: number | null
    deliveryGallons: number
    paysByCard: boolean
    tons: number | null
    averagePerGal: number | null
  }
  query: string
  sessionId: string
  demo: boolean
  /** Start as soon as the board mounts, after the consent gate. */
  autoStart?: boolean
  /** Report every change so the dashboard can keep the same rows. */
  onProgress?: (records: CallRecord[], board: Board, complete: boolean) => void
}

export function CallBoard({
  mode,
  choice,
  kind,
  providers,
  facts,
  usage,
  query,
  sessionId,
  demo,
  autoStart = false,
  onProgress,
}: CallBoardProps) {
  const startedAt = useRef(new Date().toISOString())
  const [records, setRecords] = useState<CallRecord[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [negotiated, setNegotiated] = useState(false)
  const refs = useRef<{ conversationId: string; providerId: string }[]>([])

  // R13.1: with the demo flag there is no fetch anywhere in this component.
  const replay = demo || mode === 'demo'
  const count = providers.length
  const noun = count === 1 ? 'call' : 'calls'

  const board: Board = useMemo(() => buildBoard(records, usage), [records, usage])
  const complete = replay ? elapsed >= demoDurationMs() : board.complete

  const stageDemo = useCallback(
    (milliseconds: number) => {
      const staged = providers.map((provider) => {
        const record = fixtureRecord(provider.id, milliseconds, startedAt.current)
        return (
          record ?? {
            providerId: provider.id,
            providerName: provider.name,
            vertical: provider.kind,
            conversationId: `demo-${provider.id}`,
            // A line with no fixture must never sit at "queued" forever; say it was
            // not placed rather than implying a call that will never happen.
            status: 'unsupported' as const,
            at: startedAt.current,
            durationSeconds: null,
            excerpts: [],
            quote: null,
            needsCallback: false,
            note: 'Demo mode — this line has no staged conversation, so it is not placed.',
          }
        )
      })
      setRecords(staged)
    },
    [providers],
  )

  const start = useCallback(async () => {
    setRunning(true)
    setError(null)
    startedAt.current = new Date().toISOString()
    setElapsed(0)

    if (replay) {
      stageDemo(0)
      setNotice(
        `Demo mode: ${count} conversation${count === 1 ? ' is' : 's are'} replayed from a fixture. Nothing was dialled.`,
      )
      return
    }

    try {
      const body = {
        kind,
        choice,
        facts,
        providers: providers.map((provider) => ({ id: provider.id, channel: 'phone' as const })),
        consentAt: new Date().toISOString(),
        sessionId,
      }
      const response = await fetch(withDemo('/api/calls', false), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as CallStart & { message?: string }
      if (!response.ok || payload.ok !== true) {
        setError(payload.message ?? 'That request was refused. Nothing was dialled.')
        setRunning(false)
        return
      }
      setNotice(payload.notice)
      setRecords(payload.records)
      refs.current = payload.records
        .filter((record) => record.conversationId !== '')
        .map((record) => ({ conversationId: record.conversationId, providerId: record.providerId }))
      if (payload.mode === 'off') setRunning(false)
    } catch {
      setError('The call route is unreachable. Nothing was dialled — the switch kit still works.')
      setRunning(false)
    }
  }, [replay, stageDemo, providers, facts, sessionId, choice, kind, count])

  // A consent click already said what would be said and to whom. Auto-start is
  // one run per mount, never a loop.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStarted.current || providers.length === 0) return
    autoStarted.current = true
    void start()
  }, [autoStart, providers.length, start])

  // Send every change up so the dashboard keeps the same rows the household saw.
  const lastReport = useRef('')
  useEffect(() => {
    if (!onProgress || records.length === 0) return
    const key = `${records.map((record) => `${record.providerId}:${record.status}:${record.quote ? 'q' : '-'}`).join('|')}|${complete}`
    if (key === lastReport.current) return
    lastReport.current = key
    onProgress(records, board, complete)
  }, [onProgress, records, board, complete])

  // The demo clock. One interval, stopped at the end of the staged beat.
  useEffect(() => {
    if (!replay || !running) return
    const total = demoDurationMs()
    const timer = setInterval(() => {
      setElapsed((current) => {
        const next = Math.min(total, current + DEMO_TICK_MS)
        if (next >= total) setRunning(false)
        return next
      })
    }, DEMO_TICK_MS)
    return () => clearInterval(timer)
  }, [replay, running])

  // Staging is a render of `elapsed`, not a side effect inside an updater, so a
  // double-invoked updater in dev cannot stage twice.
  useEffect(() => {
    if (!replay || records.length === 0) return
    stageDemo(elapsed)
  }, [replay, elapsed, stageDemo, records.length])

  // The live poll. Stops when every row is finished; never more than six ids.
  useEffect(() => {
    if (replay || !running || refs.current.length === 0) return
    const poll = async () => {
      const params = new URLSearchParams({
        town: facts.town,
        since: startedAt.current,
        t: String(Math.min(MAX_ELAPSED, Date.now() - Date.parse(startedAt.current))),
      })
      for (const ref of refs.current) params.append('call', `${ref.conversationId}:${ref.providerId}`)
      try {
        const response = await fetch(`/api/calls/${encodeURIComponent(sessionId)}?${params.toString()}`)
        const payload = (await response.json()) as CallPoll
        if (payload.ok) {
          setRecords(payload.records)
          setNotice(payload.notice)
          if (payload.complete) setRunning(false)
        }
      } catch {
        setError('The call board could not reach the server. The last statuses stand.')
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [replay, running, facts.town, sessionId])

  // R22.2: forget the conversations when the tab leaves this screen. Best effort.
  useEffect(() => {
    const forget = () => {
      const live = refs.current.filter((ref) => !isDemoConversationId(ref.conversationId))
      if (live.length === 0) return
      const params = new URLSearchParams()
      for (const ref of live) params.append('call', ref.conversationId)
      void fetch(`/api/calls/${encodeURIComponent(sessionId)}?${params.toString()}`, {
        method: 'DELETE',
        keepalive: true,
      })
    }
    window.addEventListener('pagehide', forget)
    return () => {
      window.removeEventListener('pagehide', forget)
      forget()
    }
  }, [sessionId])

  if (mode === 'off' && !replay) {
    return (
      <p className="rounded-card border border-dashed border-rule-strong bg-paper-sunk/60 p-3 text-small text-ink-muted">
        Calling is off on this deployment, so no number is dialled. The switch kit below has the exact question and the
        number to call yourself.
      </p>
    )
  }

  const verdictOf = (record: CallRecord) => STATUS_COPY[record.status] ?? record.status

  return (
    <section className="grid gap-4 rounded-card border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-eyebrow uppercase text-ink-muted">The calls</p>
          <h2 className="mt-2 text-title font-medium">
            {replay ? 'Played back, not dialled' : running ? 'On the phone' : 'What came back'}
          </h2>
        </div>
        {!running && records.length === 0 ? (
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
          >
            {replay
              ? `Play the ${count} ${noun}`
              : `Call ${count} ${kind === 'fuel' ? 'dealer' : 'installer'}${count === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>

      <p className="max-w-[70ch] text-small text-ink-muted">
        {replay
          ? `Demo mode: ${count} conversation${count === 1 ? ' is' : 's are'} replayed from a fixture, in the same order and with the same numbers every time. Nothing is dialled and no audio exists.`
          : 'Each call is placed by an automated AI assistant that says what it is and that the call is recorded, asks only the questions on the consent screen, and hangs up after four minutes.'}
      </p>

      {notice ? (
        <p className="rounded-card border border-rule bg-paper-sunk/60 p-3 text-small text-ink">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-card border border-deadline-edge bg-deadline-tint p-3 text-small text-ink">
          {error}
        </p>
      ) : null}

      {records.length ? (
        <ul className="grid gap-1.5">
          {records.map((record) => (
            <li
              key={`${record.providerId}-${record.conversationId || 'none'}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-rule/70 bg-paper-sunk/30 px-3 py-2 text-small"
            >
              <span className="font-medium text-ink">{record.providerName}</span>
              <span className="flex items-center gap-2">
                {record.durationSeconds !== null ? (
                  <span className="text-micro text-ink-faint tabular-nums">{record.durationSeconds}s</span>
                ) : null}
                {record.needsCallback ? (
                  <span className="rounded-pill border border-rule-strong px-2 py-0.5 text-micro text-ink-muted">
                    Will call back
                  </span>
                ) : null}
                <span className={`rounded-pill border px-2 py-0.5 text-micro ${statusTone(record.status)}`}>
                  {verdictOf(record)}
                </span>
              </span>
              {record.note ? <span className="w-full text-micro text-ink-faint">{record.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {board.fuel.length || board.installers.length ? (
        <RankedTable board={board} query={query} demo={demo} onNegotiate={() => setNegotiated(true)} negotiated={negotiated} />
      ) : records.length && complete ? (
        <p className="text-small text-ink-muted">
          No usable price came back from these calls. The switch kit below still has the question to ask.
        </p>
      ) : null}

      {board.callbacks.length ? (
        <p className="text-small text-ink">
          {board.callbacks.join(' and ')} asked to call you back. That is their number to call, not ours to give — the
          switch kit has it.
        </p>
      ) : null}

      <p className="text-micro text-ink-faint">
        Phone quote, not a contract. Confirm the price when you order. No referral fee, no paid placement, no lead
        sale: the ranking is computed from what was said on the calls and nothing else.
      </p>
    </section>
  )
}

function RankedTable({
  board,
  query,
  demo,
  onNegotiate,
  negotiated,
}: {
  board: Board
  query: string
  demo: boolean
  onNegotiate: () => void
  negotiated: boolean
}) {
  const fuelRows = board.fuel
  const installerRows = board.installers
  const best = board.best

  return (
    <div className="grid gap-4">
      {fuelRows.length ? (
        <div role="table" aria-label="Fuel quotes, cheapest first" className="grid gap-1.5">
          <div role="row" className="grid grid-cols-[1.4fr_1fr_0.8fr_0.9fr] gap-2 border-b border-rule pb-1 text-micro uppercase text-ink-faint">
            <span role="columnheader">Dealer</span>
            <span role="columnheader">A year at your use</span>
            <span role="columnheader">$/gal effective</span>
            <span role="columnheader">Earliest</span>
          </div>
          {fuelRows.map((row) => (
            <div
              key={row.providerId}
              role="row"
              className={`grid grid-cols-[1.4fr_1fr_0.8fr_0.9fr] items-baseline gap-2 rounded-card border px-3 py-2 text-small ${
                best?.providerId === row.providerId ? 'border-moss-edge bg-moss-tint' : 'border-rule/70 bg-paper-sunk/20'
              }`}
            >
              <span role="cell" className="font-medium text-ink">
                {row.providerName}
                {row.status !== 'ranked' ? (
                  <span className="ml-2 rounded-pill border border-rule-strong px-2 py-0.5 text-micro text-ink-muted">
                    Shown, not ranked
                  </span>
                ) : null}
              </span>
              <span role="cell" className="tabular-nums text-ink">
                {money(row.annualCost)}
              </span>
              <span role="cell" className="tabular-nums text-ink">
                {money(row.effectivePerGal)}
              </span>
              <span role="cell" className="text-micro text-ink-muted">
                {row.saidAt ?? '—'}
              </span>
              {row.note ? (
                <span role="cell" className="col-span-4 text-micro text-ink-faint">
                  {row.note}
                </span>
              ) : null}
              {row.evidence ? (
                <details className="col-span-4">
                  <summary className="cursor-pointer text-micro text-ink-muted underline decoration-rule-strong underline-offset-4">
                    Where that number came from
                  </summary>
                  <p className="mt-1 text-small text-ink-muted">
                    Said on a call · {row.providerName} · {row.saidAt ?? 'date not recorded'}. “{row.evidence}”
                  </p>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {installerRows.length ? (
        <div role="table" aria-label="Installer ballparks, cheapest first" className="grid gap-1.5">
          <div role="row" className="grid grid-cols-[1.4fr_1fr_0.9fr] gap-2 border-b border-rule pb-1 text-micro uppercase text-ink-faint">
            <span role="columnheader">Installer</span>
            <span role="columnheader">Ballpark total</span>
            <span role="columnheader">$/ton</span>
          </div>
          {installerRows.map((row) => (
            <div
              key={row.providerId}
              role="row"
              className={`grid grid-cols-[1.4fr_1fr_0.9fr] items-baseline gap-2 rounded-card border px-3 py-2 text-small ${
                best?.providerId === row.providerId ? 'border-moss-edge bg-moss-tint' : 'border-rule/70 bg-paper-sunk/20'
              }`}
            >
              <span role="cell" className="font-medium text-ink">
                {row.providerName}
              </span>
              <span role="cell" className="tabular-nums text-ink">
                {money(row.totalInstall)}
              </span>
              <span role="cell" className="tabular-nums text-ink">
                {row.usdPerTon === null ? '—' : `$${row.usdPerTon.toLocaleString('en-US')}`}
              </span>
              {row.note ? (
                <span role="cell" className="col-span-3 text-micro text-ink-faint">
                  {row.note}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {best?.versusAverage ? (
        <p className="text-small text-ink">
          <span className="font-medium tabular-nums">
            {best.versusAverage.perGal <= 0 ? '$' : '+$'}
            {Math.abs(best.versusAverage.perGal).toFixed(2)}/gal
          </span>{' '}
          {best.versusAverage.perGal <= 0 ? 'below' : 'above'} the DOER statewide average — about{' '}
          <span className="tabular-nums">${Math.abs(Math.round(best.versusAverage.annual)).toLocaleString('en-US')}</span> a
          year at your volume.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
        {best?.unit !== null && best?.unit !== undefined && board.fuel.length ? (
          <a
            href={withDemo(`/verdict?${withUnitPrice(query, best.unit)}`, demo)}
            className="rounded-pill bg-ink px-5 py-2.5 text-small font-medium text-paper"
          >
            Use this price
          </a>
        ) : null}
        {board.negotiation && !negotiated ? (
          <button
            type="button"
            onClick={onNegotiate}
            className="rounded-pill border border-ink px-4 py-2.5 text-small font-medium text-ink hover:bg-ink hover:text-paper"
          >
            Ask two more to beat it
          </button>
        ) : null}
        {negotiated && board.negotiation ? (
          <p className="text-small text-ink-muted">{board.negotiation.note} One round per session.</p>
        ) : null}
      </div>

      <p className="text-micro text-ink-faint">
        Every figure above is the annual cost at your own volume, and it is sorted by code, not by a model. A prebuy or
        a price cap is a bet on the winter, so it is shown and never ranked.
      </p>
    </div>
  )
}
