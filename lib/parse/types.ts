/**
 * @built F-28 types for a parsed bill — typed, editable, confidence-scored
 *
 * The model returns JSON in the shape described by `PARSE_SCHEMA_TEXT`; this file
 * is the contract the code holds it to. Nothing here trusts the model: every
 * field carries the confidence the *validator* assigned, and a missing value is
 * `null`, never 0 and never a guess.
 */

/** The four fuels this build accepts. Mirrors `lib/calc/types.ts`. */
export type BillFuel = 'oil' | 'propane' | 'gas' | 'resistance'

/** What period the number on the document covers. */
export type BillPeriod = 'delivery' | 'month' | 'season' | 'year' | 'unknown'

/** How much the validator trusts a number it is about to hand the calculator. */
export type Confidence = 'high' | 'medium' | 'low'

/** One numeric field, with its own confidence and its provenance. */
export interface BillField {
  /** `null` when the document did not clearly show it. Never inferred. */
  value: number | null
  /** 0–1. Composed from the model's own confidence and the validator's doubts. */
  confidence: number
  /** True when the validator multiplied or converted — the UI must say so. */
  derived: boolean
  /** What the number means, e.g. `gal/yr` or `$/gal`. */
  unit: string
}

/** Why a value needs a human before it reaches the calculator. */
export interface BillFlag {
  field: 'fuel' | 'units' | 'price' | 'period' | 'document'
  code:
    | 'missing'
    | 'out_of_range'
    | 'unit_mismatch'
    | 'partial_period'
    | 'low_confidence'
    | 'annualised'
    | 'not_a_bill'
  /** Safe to render as-is. Short. No address, no account number. */
  message: string
}

/** A parsed bill the UI can edit field by field. */
export interface BillParse {
  fuel: BillFuel | null
  units: BillField
  price: BillField
  /** The period the *document* covered, before any annualisation. */
  documentPeriod: BillPeriod
  /** ISO date printed on the document, when it had one. */
  documentDate: string | null
  confidence: Confidence
  /** False when the user must confirm before the calculator runs. */
  ready: boolean
  flags: BillFlag[]
}

/** A typed refusal: the parse produced nothing usable, and says why. */
export interface BillRefusal {
  code: 'not_a_bill' | 'unreadable' | 'unsupported' | 'out_of_range'
  message: string
}

/** Result of validating whatever the model returned. */
export type BillReadResult =
  | { ok: true; bill: BillParse }
  | { ok: false; refusal: BillRefusal }
