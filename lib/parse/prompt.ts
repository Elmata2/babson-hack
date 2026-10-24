/**
 * @built F-27 the vision prompt, verbatim from design.md §2.4, plus the JSON contract
 * @built F-26a v2: the printed usage chart, degree days, tank size and rate class
 *
 * The prompt is copied from the design document rather than rewritten here: it is
 * a steering artefact, and the sentence that matters most is "use null for
 * anything not clearly legible". The model reads; the validator decides.
 *
 * v2 adds four things a Massachusetts bill actually prints and v1 threw away: the
 * 12–13 month usage bar chart (the answer, already on the page), the degree days
 * on an oil ticket (which makes one delivery sufficient), the tank size, and the
 * electric rate class. Every v1 sentence is unchanged.
 *
 * Privacy: the prompt forbids the street address, account numbers, names and
 * payment details, and the route never logs the image or the response text.
 */

/** Verbatim from `.kiro/specs/switchpoint/design.md` §2.4, extended in F-26a. */
export const BILL_PROMPT = `You read a Massachusetts energy bill or heating-oil delivery receipt.
Return JSON only, matching the schema. Use null for anything not clearly legible. Never estimate, never infer a value from another value, never "correct" a number that looks unusual. If the document is not an energy bill, return {"error":"not_a_bill"}.

Read the printed monthly usage chart first if there is one. Massachusetts bills usually print 12 or 13 monthly bars. Read every bar you can see into "usage_history", oldest first. This chart is the most valuable thing on the page: it is the household's actual year, and it saves us from estimating. Do not read a bar you cannot see; a short array is better than an invented one.

"price_per_unit" is the all-in rate the household actually pays: when the document shows a total charge and a quantity, divide the total by the quantity. Report a supply-only rate only when no total is printed. A supply rate understates an electric bill by about a third, and the verdict is only as honest as this number.

Do not include the street address in your output. Do not include any account number, customer name, or payment information.

Schema:
{
  "fuel": "oil" | "propane" | "gas" | "resistance" | null,
  "quantity": number | null,
  "unit": "gal" | "therm" | "kWh" | null,
  "price_per_unit": number | null,
  "billing_period": "delivery" | "month" | "season" | "year" | null,
  "document_date": "YYYY-MM-DD" | null,
  "document_type": "oil_delivery" | "propane_delivery" | "electric_bill" | "gas_bill" | "unknown",
  "usage_history": number[] | null,
  "degree_days": number | null,
  "tank_size_gal": number | null,
  "rate_class": "R-1" | "R-2" | "heat pump" | "other" | null,
  "confidence": "high" | "medium" | "low" | null
}`

/** True when the model said, in its own envelope, that this is not an energy bill. */
export function isNotABill(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  const record = json as Record<string, unknown>
  return record.error === 'not_a_bill'
}

/**
 * The model is asked for JSON only, but a fenced block is the most common way it
 * fails at that. Strip fences before parsing; do not attempt any other repair,
 * because a repaired number is an invented number.
 */
export function stripFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}

/** Parse the model's text as JSON, or null. No coercion beyond fence stripping. */
export function readJsonBody(text: string): unknown {
  try {
    return JSON.parse(stripFence(text))
  } catch {
    return null
  }
}
