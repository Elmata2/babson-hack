import type { BillRole } from '@/lib/parse/contract'

/**
 * @built F-138 the demo bills, offered where the upload lives
 *
 * These are the synthetic bills rendered by `scripts/demo-bills/render.mjs` to
 * `public/demo-bills/` (F-80). They exist so a judge, or a teammate on a laptop
 * with no oil ticket in their pocket, can walk the whole flow in one click. Every
 * one of them is watermarked as a sample; the reader is told nothing, so it reads
 * them exactly like a household's photo.
 */

export interface BillSample {
  id: string
  /** Short button label. */
  label: string
  /** One line of what this sample proves, shown as the button's title. */
  note: string
  /** Path under `public/`. */
  url: string
  /** Which slot this sample belongs in. */
  role: BillRole
}

export const DEMO_BILL_SAMPLES: readonly BillSample[] = [
  {
    id: 'g-chandler-oil-ticket',
    label: 'Oil ticket',
    note: 'Boston delivery ticket: 140 gal at $6.23, 886 degree days — a year via degree_days.',
    url: '/demo-bills/g-chandler-oil-ticket.png',
    role: 'heating',
  },
  {
    id: 'e-gas-bill-january',
    label: 'January gas bill',
    note: 'Eversource layout, no usage history — a year scaled by Worcester County degree days.',
    url: '/demo-bills/e-gas-bill-january.png',
    role: 'heating',
  },
  {
    id: 'b-oil-ticket-no-degree-days',
    label: 'Will-call ticket',
    note: 'No degree days, so the reader has to ask how many fills a season — a question, not a guess.',
    url: '/demo-bills/b-oil-ticket-no-degree-days.png',
    role: 'heating',
  },
  {
    id: 'h-chandler-electric-competitive',
    label: 'Electric bill',
    note: 'Boston electric bill with a 12-month chart and a competitive supplier at 21.9¢.',
    url: '/demo-bills/h-chandler-electric-competitive.png',
    role: 'electricity',
  },
]
