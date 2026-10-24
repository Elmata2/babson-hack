'use client'

import Link from 'next/link'

import { useCompletedProfile } from '@/components/profile/profile-link'
import { withDemo } from '@/lib/demo'
import { SPONSOR_LABEL } from '@/lib/elec-label'
import { verdictHref } from '@/lib/profile/completion'
import type { BillFuel } from '@/lib/parse/types'

const FUEL_LABEL: Record<BillFuel, string> = {
  oil: 'Heating oil',
  propane: 'Propane',
  gas: 'Natural gas',
  resistance: 'Electric resistance',
}

const primary =
  'group inline-flex items-center gap-3 rounded-pill bg-ink px-6 py-3.5 text-small font-medium text-paper shadow-[0_14px_34px_-16px_rgba(0,0,0,0.55)] transition-[translate,scale,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 active:scale-[0.97]'

const secondary =
  'rounded-pill border border-rule-strong px-5 py-3 text-small font-medium text-ink transition-[border-color,scale] duration-200 ease-out-expo hover:border-ink active:scale-[0.97]'

export function ProfileSummary({ demo }: { demo: boolean }) {
  const completed = useCompletedProfile()

  if (!completed) {
    return (
      <div className="grid gap-5">
        <p className="max-w-[46ch] text-lede text-ink-muted">
          No profile on this device yet. It takes two bills and about two minutes.
        </p>
        <div>
          <Link href={withDemo('/onboarding', demo)} className={primary}>
            Create your profile
            <span aria-hidden className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    )
  }

  const { account } = completed
  const incomeLabel =
    completed.income === 'yes' ? 'Under the limit' : completed.income === 'no' ? 'Not under the limit' : 'Not sure'
  const verdict = verdictHref(completed)

  return (
    <div className="grid gap-8">
      <dl className="divide-y divide-rule border-y border-rule">
        <Row term="Profile">
          {account.name} · {account.email}
          {account.phone ? ` · ${account.phone}` : ''}
        </Row>
        <Row term="Heating fuel">{FUEL_LABEL[completed.fuel]}</Row>
        <Row term="Town">
          {completed.town}
          {completed.utility ? ` · ${SPONSOR_LABEL[completed.utility]}` : ''}
        </Row>
        {completed.kwh ? <Row term="Electricity use">{completed.kwh} kWh a month</Row> : null}
        <Row term="Income limit">{incomeLabel}</Row>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={withDemo(verdict ?? '/onboarding', demo)} className={primary}>
          See your verdict
          <span aria-hidden className="transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5">
            →
          </span>
        </Link>
        <Link href={withDemo('/onboarding', demo)} className={secondary}>
          Update my bills
        </Link>
      </div>

      <p className="text-micro text-ink-muted">Stored in this browser only. Nothing is sent to a server.</p>
    </div>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[minmax(0,13rem)_1fr] sm:items-baseline sm:gap-6">
      <dt className="text-micro text-ink-muted">{term}</dt>
      <dd className="text-small text-ink">{children}</dd>
    </div>
  )
}
