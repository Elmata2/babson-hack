import { describe, expect, it } from 'vitest'

import { buildReminderIcs } from '../reminder'

const NOW = new Date('2026-10-24T15:00:00.000Z')
const URL_ = 'https://switchpoint.example/verdict?fuel=gas&units=1000&price=1.90&town=Boston'

describe('buildReminderIcs', () => {
  const ics = buildReminderIcs(URL_, NOW)
  const unfolded = ics.replace(/\r\n /g, '')

  it('is one all-day event on 5 January 2027', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20270105')
    expect(unfolded).toContain('DTEND;VALUE=DATE:20270106')
    expect(unfolded).toContain('SUMMARY:Switchpoint: re-check your heat pump verdict')
    expect(unfolded).toContain('DTSTAMP:20261024T150000Z')
  })

  it('carries the verdict link in the description', () => {
    expect(unfolded).toContain(URL_.replace(/,/g, '\\,'))
  })

  it('folds every line to 75 octets and sends no personal data', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(unfolded).not.toMatch(/ATTENDEE|ORGANIZER/)
  })
})
