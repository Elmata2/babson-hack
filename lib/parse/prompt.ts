/**
 * @built F-27 the vision prompt, verbatim from design.md §2.4, plus the JSON contract
 * @built F-26a v2: the printed usage chart, degree days, tank size and rate class
 * @built F-101 v3: printed numbers only (no model division), utility, ZIP/town, period, rate classes R-1..R-4, CCF, history kind
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
 * v3 reverses one v2 instruction: the model no longer divides total by quantity.
 * Arithmetic belongs to code (ADR-005, "the LLM reads, code decides"), so the
 * model copies `total_charge` and `quantity` and `plausibility.ts` divides.
 *
 * Privacy: the prompt allows only the ZIP and town, forbids the street address, account numbers, names and
 * payment details, and the route never logs the image or the response text.
 */

/**
 * The JSON contract, exported on its own so the route, the tests and the docs
 * can name it without re-parsing the prompt. `BILL_PROMPT` embeds it verbatim.
 */
export const PARSE_SCHEMA_TEXT = `{
  "document_type": "oil_delivery" | "propane_delivery" | "electric_bill" | "gas_bill" | "unknown",
  "utility": "eversource" | "national_grid" | "unitil" | "liberty" | "berkshire_gas" | "municipal" | "oil_dealer" | "propane_dealer" | "other" | null,
  "fuel": "oil" | "propane" | "gas" | "resistance" | null,
  "service_zip": "5 digits" | null,
  "service_town": string | null,
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "days": number | null,
  "document_date": "YYYY-MM-DD" | null,
  "billing_period": "delivery" | "month" | "season" | "year" | null,
  "quantity": number | null,
  "unit": "gal" | "therm" | "CCF" | "kWh" | null,
  "therm_factor": number | null,
  "total_charge": number | null,
  "supply_charge": number | null,
  "delivery_charge": number | null,
  "price_per_unit": number | null,
  "supplier_name": string | null,
  "rate_class": "R-1" | "R-2" | "R-3" | "R-4" | "heat pump" | "other" | null,
  "discount_line_present": boolean,
  "read_type": "actual" | "estimated" | null,
  "budget_billing": boolean,
  "usage_history": number[] | null,
  "history_kind": "numbers" | "bars" | null,
  "degree_days": number | null,
  "tank_size_gal": number | null,
  "heat_source_hint": "this bill heats the home" | "not stated",
  "confidence": "high" | "medium" | "low" | null
}`

/**
 * Prompt v3. Steering artefact: "use null for anything not clearly legible" is the
 * sentence that matters most. The model copies printed numbers; every division,
 * unit conversion and annualisation happens in code (ADR-005).
 */
export const BILL_PROMPT = `You read a Massachusetts energy bill or heating-oil delivery receipt.
Return JSON only, matching the schema. Use null for anything not clearly legible. Never estimate, never infer a value from another value, never "correct" a number that looks unusual. If the document is not an energy bill, return {"error":"not_a_bill"}.

The document may arrive as several images or pages of one bill (the usage table is often on page 2). Combine them into one answer; do not return one answer per page.

Read the printed monthly usage history first if there is one. Massachusetts bills usually print 12 or 13 months. Read every month you can see into "usage_history", oldest first. This history is the most valuable thing on the page: it is the household's actual year, and it saves us from estimating. Do not read a month you cannot see; a short array is better than an invented one. Set "history_kind" to "numbers" when the usage is printed as a table of figures (National Grid prints a 13-month table on page 2), or "bars" when you can only read bar heights (Eversource prints bars only). Reading bars by eye is less reliable, and we treat it that way.

Copy the numbers the bill prints; do not calculate any. Never divide, multiply or convert. "total_charge" is the total current charges for this service, not the "amount due": under budget billing the amount due is a levelised figure and is wrong for this purpose. Also copy "supply_charge" and "delivery_charge" when printed, and "quantity" with its printed unit. Fill "price_per_unit" only when the document prints a single per-unit price (oil and propane tickets); otherwise null. We compute the all-in price ourselves from the total and the quantity.

Gas may be billed in CCF with a conversion line such as "126 x Therm factor of 1.0303 = 130 Therms". Report the quantity and unit as printed ("CCF") and copy the factor into "therm_factor".

Report the service period as "period_start" and "period_end" (YYYY-MM-DD) and "days" when printed. Tickets and bills print dates as M/D/YYYY; copy the printed digits into YYYY-MM-DD (10/20/2026 becomes 2026-10-20). Report "supplier_name" as printed in the supply section ("Basic Service", a competitive supplier, or a town aggregation name).

"rate_class" is the Massachusetts residential class as printed. Gas: R-1 non-heat, R-2 low-income non-heat, R-3 heating, R-4 low-income heating. Electric: R-1 regular, R-2 low-income. Eversource prints a description such as "R-3 Residential Heating" or "...Heating Assistance"; map it to its class. Use "heat pump" for a heat-pump rate and "other" for anything else. Set "discount_line_present" true when a discount line is printed ("Assistance Rate Discount" on Eversource, "Discount 25%" on National Grid), else false. Set "read_type" to "actual" or "estimated" as the bill states it, and "budget_billing" true only when the bill says it is on budget or levelised billing.

Set "heat_source_hint" to "this bill heats the home" only when the bill itself says so (for example a heating rate); otherwise "not stated".

For the service address, report ONLY the 5-digit ZIP ("service_zip") and the town ("service_town"). Never the street, the unit number or anything else of the address. Do not include any account number, customer name, or payment information.

Schema:
${PARSE_SCHEMA_TEXT}`

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
