/**
 * @built F-27 the vision prompt, verbatim from design.md §2.4, plus the JSON contract
 *
 * The prompt is copied from the design document rather than rewritten here: it is
 * a steering artefact, and the sentence that matters most is "use null for
 * anything not clearly legible". The model reads; the validator decides.
 *
 * Privacy: the prompt forbids the street address, account numbers, names and
 * payment details, and the route never logs the image or the response text.
 */

/** Verbatim from `.kiro/specs/switchpoint/design.md` §2.4. Do not edit casually. */
export const BILL_PROMPT = `You read a Massachusetts energy bill or heating-oil delivery receipt.
Return JSON only, matching the schema. Use null for anything not clearly legible. Never estimate, never infer a value from another value, never "correct" a number that looks unusual. If the document is not an energy bill, return {"error":"not_a_bill"}.

Do not include the street address in your output. Do not include any account number, customer name, or payment information.

Schema:
{
  "fuel": "oil" | "propane" | "gas" | "resistance" | null,
  "quantity": number | null,
  "unit": "gal" | "therm" | "kWh" | null,
  "price_per_unit": number | null,
  "billing_period": "delivery" | "month" | "season" | "year" | null,
  "document_date": "YYYY-MM-DD" | null,
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
