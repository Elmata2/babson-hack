'use client'

import { buildReminderIcs } from '@/lib/verdict/reminder'
import { verdictPath } from '@/lib/verdict/share-query'

export function ReminderButton({
  label,
  className,
  path,
}: {
  label: string
  className?: string
  /** The verdict to reopen from the calendar entry. Defaults to the page's own query. */
  path?: string
}) {
  function download() {
    const ics = buildReminderIcs(
      `${window.location.origin}${path ?? verdictPath(window.location.search)}`,
      new Date(),
    )
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'switchpoint-recheck-2027-01.ics'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" onClick={download} className={className}>
      {label}
    </button>
  )
}
