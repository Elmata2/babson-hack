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

/** What kind of document the model thinks it is looking at. */
export type DocumentType =
  | 'oil_delivery'
  | 'propane_delivery'
  | 'electric_bill'
  | 'gas_bill'
  | 'unknown'

/** The rate class printed on an electric bill, when it is legible. */
export type RateClass = 'R-1' | 'R-2' | 'heat pump' | 'other'

/**
 * How a document that covers less than a year became an annual figure.
 * Ordered best to worst; `annualise` resolves in this order.
 */
export type AnnualMethod =
  /** 12+ months of usage printed on the document — exact. */
  | 'printed_history'
  /** An oil ticket that prints degree days — best estimate. */
  | 'degree_days'
  /** The user's own delivery cadence, confirmed by them. */
  | 'tank_cadence'
  /** One winter month divided by its share of the heating year. */
  | 'hdd_scaled'
  /** One month × 12, for fuel that is not the heat source. */
  | 'monthly_x12'

/**
 * One annual figure and everything behind it. The UI renders `method`,
 * `confidence`, `assumptions` and `note` next to the number — a value from here
 * is never shown bare.
 */
export interface AnnualEstimate {
  /** Annual units in the fuel's own unit (gal, therm, kWh). */
  value: number
  method: AnnualMethod
  /** 0–1, capped by the method. Never higher than the method's ceiling. */
  confidence: number
  /** Human-readable, rendered in the UI. Empty only for printed history. */
  assumptions: string[]
  /** One sentence the UI shows next to the number. */
  note: string
}

/** Why `annualise` declined to produce a year. A question, never a dead end. */
export interface AnnualRefusal {
  code: 'summer_month' | 'needs_fills' | 'partial_period' | 'out_of_range' | 'missing_quantity'
  /** Safe to render as-is. */
  message: string
}

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
  field: 'fuel' | 'units' | 'price' | 'period' | 'document' | 'annualisation'
  code:
    | 'missing'
    | 'out_of_range'
    | 'unit_mismatch'
    | 'partial_period'
    | 'low_confidence'
    | 'annualised'
    | 'not_a_bill'
    /** The price is inside the hard band but outside this season's DOER survey. */
    | 'stale_price'
    /** A heating bill from May–September cannot describe a heating year. */
    | 'summer_month'
    /** One delivery, and nobody has said how many fills a season holds. */
    | 'needs_fills'
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
  /** What the document is, as the model classified it. Never inferred here. */
  documentType: DocumentType | null
  /** The rate class on an electric bill. `null` when the bill did not print one. */
  rateClass: RateClass | null
  /**
   * How the units above became a year, and how much of it is arithmetic on an
   * assumption. `null` when the document already covered a year (or a season),
   * because nothing was annualised.
   */
  annualisation: AnnualEstimate | null
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
