/**
 * @built F-36 one place where a verdict figure becomes text
 *
 * Rounding at the display edge, never in `lib/calc`: the engine keeps full
 * precision and every visible number here is a rendering of a value the engine
 * produced. The provenance drawer prints the same string as the screen, so a
 * reader can check the arithmetic against the figure they clicked.
 */

/** Whole dollars — the headline treatment. */
export function usd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

/** Dollars and cents, for substituted values in a formula. */
export function usdExact(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** A $/kWh rate as cents, the way a Massachusetts bill writes it. */
export function cents(ratePerKWh: number): string {
  return `${(ratePerKWh * 100).toFixed(1)}¢`
}

/** Whole units with thousands separators: kWh, BTU/hr, HDD. */
export function count(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** One decimal, for tons and years. */
export function one(value: number): string {
  return value.toFixed(1)
}
