'use client'

/**
 * @built F-39 plain-English panel — three sentences, computed locally first, checked when written by a model
 * @built F-49 in demo mode no request is made at all: the deterministic
 * sentences below are the answer, so the panel works with the network unplugged
 *
 * It renders the deterministic sentences immediately so the section is never
 * empty and never waits on a network. If `/api/explain` answers with a version a
 * model wrote, and that version passes the number guard on the server, it
 * replaces the fallback. A failure is invisible: the page already said the same
 * thing.
 */

import { useEffect, useMemo, useState } from 'react'

import type { VerdictResult } from '@/lib/calc/types'
import { demoFromLocation } from '@/lib/demo'
import { fallbackSentences } from '@/lib/verdict/explain'

interface ExplainState {
  sentences: string[]
  source: 'model' | 'fallback'
}

export function ExplainPanel({ result }: { result: VerdictResult }) {
  const fallback = useMemo(() => fallbackSentences(result), [result])
  const [state, setState] = useState<ExplainState>({ sentences: fallback, source: 'fallback' })

  useEffect(() => {
    let alive = true
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    // R13.1: demo means no request at all, not a request the route answers locally.
    // The deterministic sentences are already on screen.
    const demo = demoFromLocation()
    if (demo) return

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result }),
    })
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : null))
      .then((payload) => {
        if (!alive || payload === null || typeof payload !== 'object') return
        const body = payload as { ok?: unknown; sentences?: unknown; source?: unknown }
        if (body.ok !== true || !Array.isArray(body.sentences)) return
        const sentences = body.sentences.filter((sentence): sentence is string => typeof sentence === 'string')
        if (sentences.length === 0) return
        setState({ sentences, source: body.source === 'model' ? 'model' : 'fallback' })
      })
      .catch(() => {
        // The fallback is already on screen; a failed writer changes nothing.
      })

    return () => {
      alive = false
    }
  }, [result])

  return (
    <section className="mt-4 rounded-card border border-rule bg-surface p-5 sm:p-6" aria-labelledby="plain-english">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plain-english" className="text-title font-medium">
          In plain English
        </h2>
        <p className="text-micro text-ink-faint">
          {state.source === 'model'
            ? 'Written by a model from this page’s numbers, then checked against them.'
            : 'Three sentences from this page’s numbers. No network needed.'}
        </p>
      </div>
      <div className="mt-3 grid gap-2">
        {state.sentences.map((sentence, index) => (
          <p key={`${index}-${sentence}`} className="max-w-[68ch] text-body text-ink">
            {sentence}
          </p>
        ))}
      </div>
    </section>
  )
}
