export const REMINDER_DATE = '2027-01-05'
export const REMINDER_TITLE = 'Switchpoint: re-check your heat pump verdict'

const CRLF = '\r\n'

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10).replace(/-/g, '')
}

export function buildReminderIcs(verdictUrl: string, now: Date): string {
  const day = REMINDER_DATE.replace(/-/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Switchpoint//Reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:recheck-${day}-${stamp(now)}@switchpoint`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${nextDay(REMINDER_DATE)}`,
    `SUMMARY:${escapeText(REMINDER_TITLE)}`,
    `DESCRIPTION:${escapeText(`Prices and rebates reset in January. Open your verdict again: ${verdictUrl}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join(CRLF) + CRLF
}
