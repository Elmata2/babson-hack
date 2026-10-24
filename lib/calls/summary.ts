/**
 * @built F-128 the agent's result, in the shape the dashboard can keep
 *
 * `CallBoard` computes a ranking for the screen. The dashboard lives in another
 * route, so it needs the same result in a small, serialisable shape: one row per
 * provider, the best comparable number, and whether the run finished. This module
 * is pure so the summary can never disagree with the table it came from.
 */

import type { StoredQuoteRow, StoredQuotes } from '../switch/types'
import type { CallBoard } from './board'

export function quotesForStore(board: CallBoard, at: Date): StoredQuotes | null {
  if (board.fuel.length === 0 && board.installers.length === 0) return null

  const rows: StoredQuoteRow[] = board.fuel.length
    ? board.fuel.map((row) => ({
        providerId: row.providerId,
        providerName: row.providerName,
        kind: 'fuel',
        status: row.status === 'ranked' ? 'ranked' : 'shown',
        figure: row.annualCost,
        unit: row.effectivePerGal,
        note: row.note,
        evidence: row.evidence,
        at: row.saidAt,
      }))
    : board.installers.map((row) => ({
        providerId: row.providerId,
        providerName: row.providerName,
        kind: 'installer',
        status: row.status === 'ranked' ? 'ranked' : 'shown',
        figure: row.totalInstall,
        unit: row.usdPerTon,
        note: row.note,
        evidence: row.evidence,
        at: row.saidAt,
      }))

  const best = board.best
    ? {
        providerId: board.best.providerId,
        providerName: board.best.providerName,
        figure: board.best.figure,
        unit: board.best.unit,
      }
    : null

  return {
    kind: board.fuel.length > 0 ? 'fuel' : 'installer',
    rows,
    best,
    complete: board.complete,
    at: at.toISOString(),
  }
}
