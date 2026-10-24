# Design — Switchpoint

**Status:** approved for build · 2026-10-24
**Reads with:** `requirements.md` (what), `../steering/mass-save-rules.md` (the
only legal source of program numbers), `../steering/units-and-conventions.md`
(how to count).

---

## 1. Shape of the thing

```
┌──────────────────────── browser ────────────────────────┐
│  /                     address + one-prompt intake       │
│  /bill                 photo → parsed fields → confirm   │
│  /verdict/[id]         the number, the dial, the math    │
│  /map                  state → town → tract → parcel     │
│                                                          │
│  lib/calc  (pure, deterministic, property-tested)        │
└───────────────▲──────────────────────────▲──────────────┘
                │ typed result             │ JSON
┌───────────────┴──────────────────────────┴──────────────┐
│  app/api/parse-bill    vision, no storage, no address   │
│  app/api/prices        EIA → DOER snapshot fallback     │
│  app/api/geocode       Census geocoder → tract          │
│  app/api/parcel        MassGIS L3 → YEAR_BUILT etc.     │
│  app/api/explain       one LLM call, prose only         │
└─────────────────────────────────────────────────────────┘
```

**The rule that keeps this shippable:** the calculation never leaves the browser
and never touches the network. Every server route is an *enrichment*. Delete all
five and the app still returns a verdict from manually entered numbers. That is
also the failover story for judging.

## 2. Module contracts

### 2.1 `lib/calc/` — pure core

```ts
// lib/calc/types.ts
export type Fuel = 'oil' | 'propane' | 'gas' | 'resistance'
export type Tier = 'whole' | 'partial' | 'basic' | 'enhanced'

export interface HeatingInput {
  fuel: Fuel
  /** gallons (oil, propane) | therms (gas) | kWh (resistance) */
  annualUnits: number
  /** $ per gallon | $ per therm | $ per kWh */
  unitPrice: number
  afue?: number              // overrides table default
  /** town name, used to pick the HDD zone and the utility sponsor */
  town?: string
  /** MassGIS sponsor key: eversource | nationalgrid | unitil | cape_light | mlp | mixed */
  utility?: string
  /** deg F, defaults to the town's HDD zone, then Boston */
  hdd65?: number
  designTempF?: number
  sqft?: number              // only for envelope fallback
  /** drives the envelope-intensity bucket: <1950 / 1950–2000 / >2000 */
  yearBuilt?: number
}

export interface UpgradeInput {
  tier: Tier
  installYear: 2026 | 2027
  tons?: number              // computed if absent
  installCost?: number       // default 22_000
  weatherizationBonus?: boolean
  sizingBonus?: boolean
  heatPumpRate: number       // $/kWh
  standardRate: number       // $/kWh
  scop?: number              // default 2.7
}

export interface VerdictResult {
  deliveredMMBtu: number
  designBTUhr: number
  tons: number
  annualKWh: number
  oldAnnualCost: number
  newAnnualCostStandard: number
  newAnnualCostHeatPumpRate: number
  annualSavings: number            // signed, may be < 0
  annualSavingsAtHeatPumpRate: number
  totalRebate: number
  rebateBreakdown: { label: string; amount: number; source: string }[]
  netCost: number
  paybackYears: number | null      // null when savings <= 0
  monthlyLoan: number
  monthlySavings: number
  cashFlowPositive: boolean
  breakEvenElectricPrice: number | null   // $/kWh, only when savings <= 0
  rebate2027: number
  cliffCost: number                // rebate2026 - rebate2027, >= 0
  verdict: 'SWITCH_NOW' | 'SWITCH_BEFORE_DEC31' | 'DO_NOT_SWITCH_YET'
  reasons: string[]
  caveats: string[]
  assumptions: Assumption[]        // every default used, with its justification
}
```

Function list, all pure, all exported, all documented:

```
deliveredHeat(input) → { mmBtu, btu, source:'bill'|'envelope' }
designLoad({ btu, hdd65, designTempF, sqft }) → { ua, btuhr }
sizeTons(btuhr) → number                       // round to 0.5
rebate(tier, tons, installYear, opts) → { total, breakdown[] }
annualKWh(btu, scop) → number
operatingCost(kWh, rate) → number
payback(netCost, savings) → number | null
heatLoan(netCost, months = 84, apr = 0) → { monthly, totalInterest }
breakEvenElectricPrice({ btu, oldCost, scop }) → number
verdictOf(result) → Verdict
computeVerdict(heating, upgrade) → VerdictResult
```

### 2.2 Formula sheet (unit-checked, one source of truth)

```
deliveredBTU   = units × BTU_per_unit × AFUE
UA (BTU/hr/°F) = deliveredBTU / (24 × HDD65)
designBTUhr    = UA × (65 − T_design)
tons           = round0.5(designBTUhr / 12_000)
annualKWh      = deliveredBTU / (BTU_PER_KWH × SCOP)
oldCost        = units × unitPrice
newCost        = annualKWh × rate
savings        = oldCost − newCost              // signed
rebateBase     = min(tons × ratePerTon, cap)
rebateTotal    = min(rebateBase + bonuses, capAfterBonuses)
netCost        = installCost − rebateTotal
paybackYears   = netCost / savings              // null if savings ≤ 0
breakEvenRate  = oldCost / annualKWh            // $/kWh where savings = 0
monthlyLoan    = netCost / 84
```

Sanity anchor, computed by hand and asserted in a test: 800 gal oil at $6.23,
AFUE 0.80, SCOP 2.70, seasonal rate $0.235 → 88.64 MMBtu, design load 38,252
BTU/hr, **3.0 tons**, 9,621 kWh, $4,984 → $2,261, savings **$2,723**, rebate
**$7,950** (3.0 × $2,650, cap not reached), net cost **$14,050**, payback
**5.16 yr**, 2027 rebate **$7,050**, cliff cost **$900**, verdict
`SWITCH_BEFORE_DEC31`.

*Correction, 2026-10-24: the first draft of this section said net cost $13,500
and payback 4.96 yr. That assumed the $8,500 cap, which 3.0 tons does not reach.
The corrected figures above are what `lib/calc` asserts.*

### 2.2a What `annualSavings` means (settled)

`annualSavings` is computed at the **seasonal heat pump rate** (Nov 1 – Apr 30) —
the rate a heat-pump customer is eligible for and the one Mass Save's own
calculator tells users to enter. `annualSavingsAtStandardRate` is the
conservative view and **must also be rendered**, labelled, on the verdict screen.

The verdict guard is conservative even though the headline is not:

1. `annualSavingsAtStandardRate <= 0` → `DO_NOT_SWITCH_YET`
2. `paybackYears === null || paybackYears > 15` → `DO_NOT_SWITCH_YET`
3. `installYear === 2026 && rebate2026 > rebate2027` → `SWITCH_BEFORE_DEC31`
4. otherwise → `SWITCH_NOW`

If the two rates disagree about whether the household saves money, the screen
says so explicitly. No household should be told to spend $22,000 on a number that
only works in winter.

### 2.3 Server routes

| Route | Method | In | Out | Never |
| --- | --- | --- | --- | --- |
| `/api/parse-bill` | POST multipart | image/pdf | `BillParse` | store, log, or forward the image |
| `/api/prices` | GET | — | `{ oil, propane, elec, asOf, mode }` | invent a value on failure |
| `/api/geocode` | GET `?q=` | address | `{ lat, lon, tract, county }` | persist the address |
| `/api/parcel` | GET `?lat=&lon=` | point | `{ yearBuilt, useCode, town, siteAddr }` | require a key |
| `/api/explain` | POST | `VerdictResult` (no PII) | `{ sentences: string[] }` | see the address or the bill |

All routes: `export const runtime = 'edge'` where the SDK allows, aggressive
`revalidate`, 6s timeout, typed error envelope `{ ok: false, code, message }`.
The client treats every failure as "continue without this".

### 2.4 OCR prompt (verbatim in code, `.kiro/steering`-compliant)

```
You read a Massachusetts energy bill or heating-oil delivery receipt.
Return JSON only, matching the schema. Use null for anything not clearly
legible. Never estimate, never infer a value from another value, never
"correct" a number that looks unusual. If the document is not an energy
bill, return {"error":"not_a_bill"}.

Do not include the street address in your output. Do not include any
account number, customer name, or payment information.
```

Then a deterministic validator (`lib/parse/plausibility.ts`) rejects impossible
values and returns `flags[]` instead of silently trusting the model. LLM reads;
code decides.

## 3. Map design

**Stack:** MapLibre GL JS + CARTO Positron raster/vector basemap (no key,
attribution required). No Google Maps — key, billing, and a judge asking about
cost.

**Layers, bottom to top**
1. basemap
2. `tracts-fill` — choropleth, `fill-color` data-driven from the active metric
3. `ej-overlay` — optional equity lens from MassGIS EJ2020, rendered at 25%
   opacity in a neutral violet so it never reads as a heat value
4. `tracts-line` — 0.5px, 30% opacity, structural only
5. `parcel-pins` — circle layer, only for the selected town
6. `selected` — highlight ring on the active tract

Two lenses stack without confusing the reader: **heat** (this app's data) is a
warm sequential ramp; **equity** is a categorical wash. Never encode both in the
same hue, and never let the equity layer alter a heat value (R10.9).

The utility sponsor is a third, non-map encoding: a badge in the tract panel
(`Eversource`, `National Grid`, `Unitil`, `Cape Light Compact`, or
`Municipal light plant — Mass Save rebates do not apply`). Towns with
`ELEC_LABEL` listing both a municipal department and an IOU are marked `mixed`
and the panel asks the user which one bills them.

**Metrics** (switchable, all derived from ACS B25040 + DOER prices):

| Metric | Computation | Why a human cares |
| --- | --- | --- |
| `oil_share` | oil HH / total HH | where the exposure is |
| `oil_spend` | oil HH × 750 gal × $6.23 | dollars leaving the neighbourhood |
| `cliff_homes` | oil HH (proxy for whole-home candidates) | homes that lose $1,000 on Jan 1 |
| `cliff_dollars` | `cliff_homes × 1000` | the statewide number that ends the pitch |

The 750 gal/tract figure is an assumption. It is displayed as
`assumes 750 gal/household` in the legend footer, in the tooltip, and in the
tract panel — the same transparency rule as everywhere else.

**Frame the interaction:** the map is not a dashboard, it is a *drill*.
State → click a town → click a tract → panel → "use this tract" seeds the
calculator with that tract's median year built and typical oil use. The map and
the calculator are one object with two views.

**The scrubber.** A single 2026↔2027 range control. Dragging it recolors the
choropleth and tweens a headline number from `$0 lost` to `$XX.X M lost on
Jan 1`. Animating a loss is the most persuasive 3 seconds in the demo.

**Fallbacks, in order:** vector tiles → baked GeoJSON (guaranteed) → static PNG
of the same map at build time → accessible table. At no point is the user
blocked.

**Prebaking.** `scripts/bake-map.mjs` writes `public/data/tracts.geojson`
(5 towns: Wellesley, Newton, Natick, Needham, Framingham) and
`public/data/parcels-{town}.json` (capped at 3,000 parcels each). Built once,
committed, never fetched at runtime in `?demo=1`.

## 4. Build log implementation

`scripts/buildlog.mjs` — zero dependencies, Node 22.

- **Registry** parsed from `tasks.md` rows matching `/^\|\s*(F-\d+)\s*\|/`
  → `{ id, phase, title, owner, estimate }`.
- **Events** appended to `.buildlog/events.jsonl`:
  `{ id, phase, title, file, ts, commit, source:'marker'|'manual', tag?, text? }`.
- **Dedupe** on `id + file` for markers; manual notes never dedupe.
- **`write`** renders `BUILDLOG.md` in this order: header + commit + generated
  timestamp → "Now" (last 3 events) → "Next up" (first 5 registry rows with no
  event) → overall progress bar → phase table → full timeline, newest first.
- **Idempotent:** writing twice with no new events produces a byte-identical
  file (timestamps come from events, not `Date.now()`).
- **`watch`** polls mtimes every 2s; ignores `node_modules`, `.next`, `.git`.

Colour in `status`: green built, dim pending, red blocked (blocked is stored as a
manual note with tag `blocked`).

## 5. Property-based testing plan

`fast-check` on `lib/calc`, run with `vitest`. This is the single strongest
"we used Kiro properly" artefact, because PBT is a named judging sub-criterion
and because a conversion calculator is exactly the domain where invariants beat
examples.

| # | Property | Why it matters |
| --- | --- | --- |
| P1 | `deliveredMMBtu > 0` for any positive units | a bill of 0 gallons must not produce a division by zero |
| P2 | Monotonic in fuel price | raising $/gal never increases savings |
| P3 | Monotonic in electricity price | raising ¢/kWh never increases savings |
| P4 | `totalRebate ≤ installCost` | never a negative net cost |
| P5 | `totalRebate ≤ cap(tier, year)` before bonuses, `≤ capAfter` after | the cap is the cap |
| P6 | `payback = netCost / savings` within 1e-9 | no drifting arithmetic |
| P7 | Savings sign matches `breakEvenElectricPrice` comparison | the number we show and the number we claim agree |
| P8 | `rebate2027 ≤ rebate2026` for every tier | the step-down can only go one way |
| P9 | Deterministic: same input twice → deep-equal output | the demo cannot surprise us |
| P10 | No `NaN`, `Infinity`, or negative kWh for any generated bill shape | the killer demo bug class |
| P11 | Verdict function is total: every input yields one of three values | no undefined state on a judge's phone |
| P12 | Round-trip: unit conversions MMBtu→BTU→MMBtu within 1e-9 | catches a 3,412 vs 3,412.14 typo |

Generators constrain to realistic MA ranges, and one generator deliberately
produces *hostile* inputs (0 units, 1e9 units, 2029 install year, unknown fuel)
to prove the code refuses rather than guesses.

## 6. Kiro workflow (this is ~⅓ of the score — treat it as a feature)

| Artefact | Where | What it proves |
| --- | --- | --- |
| Spec | `.kiro/specs/switchpoint/{requirements,design,tasks}.md` | spec-driven, not vibe-coded |
| Steering | `.kiro/steering/*.md` | constraints the agent must obey; `mass-save-rules.md` is why the model never invents a rebate |
| Hooks | `.kiro/hooks/*.json` | automation of the boring parts |
| PBT | `lib/calc/__tests__/properties.test.ts` | the "did PBT catch something" answer, with a real example |
| MCP | `mcp/data-server` | address → parcel + price in one tool call, no scraping |
| Build log | `BUILDLOG.md` | process, visible |

The honest write-up line: *we gave the agent the policy document as steering so
it could not hallucinate a rebate, and property tests so a plausible-looking
wrong answer could not survive.* Both are cheap to say and demonstrably true in
the repo.

## 7. Performance budget

| Step | Budget | Enforcement |
| --- | --- | --- |
| Cold load → intake | 1.2s | static, no blocking fetch |
| Address → parcel prefill | 1.5s | parallel geocode + parcel, 4s abort |
| Bill OCR round trip | 6s | stream tokens, show fields as they land |
| Recompute on field edit | 16ms | pure function, no network |
| Map first paint | 2.0s | baked GeoJSON, no live tiles required |
| Verdict → demo video | 180s | hard cap, judges stop watching |

## 8. Failure modes, ranked by probability

| Prob | Failure | Mitigation |
| --- | --- | --- |
| High | Venue wifi dies | `?demo=1`, baked data, local calc |
| High | OCR mangles a bill | manual entry is one tap away and equally fast |
| Med | EIA key absent at build | snapshot adapter, badge says snapshot |
| Med | Map tiles blocked by network | baked GeoJSON render, table fallback |
| Med | A judge picks a gas house | verdict is `DO_NOT_SWITCH_YET`; that is the feature |
| Low | Census geocoder rate-limits | manual address + town select |
| Low | Someone asks about Zillow | we wrote ADR-001 explaining why not |

## 9. Architecture decisions, recorded

- **ADR-004 — No database.** See `data-sources.md`.
- **ADR-005 — Rules engine, not model arithmetic.** The LLM reads documents and
  writes sentences. It never computes a number that reaches the screen. This is
  both a correctness guarantee and the answer to "isn't this a ChatGPT wrapper".
- **ADR-006 — Map is baked, not live.** A live spatial API is a 4-second risk in
  a 90-second demo. Baked at build time, refreshed by script.
- **ADR-007 — Verdict is the API.** The product returns a decision, not a
  dashboard. If a screen does not change the decision, it does not ship.

## 10. The 2:40 demo (write the video against this)

| t | Beat |
| --- | --- |
| 0:00 | Oil bill on screen: **$4,984**. "One winter, one house, Framingham." |
| 0:15 | "Oil is up 75% in a year. 29% of Massachusetts heats with oil. In 68 days the rebate drops." |
| 0:30 | Paste the address → parcel fills in. Upload the receipt → fields land. |
| 0:50 | The number flips: **$4,984 → $2,261**. Payback 5.2 years. 0% loan: **+$60/month** in your pocket. |
| 1:10 | Click the number → formula, substituted values, source date. "Every figure is auditable." |
| 1:25 | Change the address to **Wellesley**. The rebate line dies: *your town is served by a municipal light plant — Mass Save electric rebates do not apply.* **This is the beat that wins the room.** |
| 1:45 | Switch to the gas house. **DON'T SWITCH YET**, break-even 14.2¢/kWh. |
| 2:05 | Map. Oil share. Drag the scrubber to 2027 — the map loses **$X M** on Jan 1. |
| 2:25 | "Mass Save's calculator asks you to guess your fuel use. We read the bill, check your utility, and give a verdict." |
| 2:35 | One line: *Switchpoint — the honest heat pump verdict for Massachusetts.* |

The Wellesley beat is not a bug demonstration. It is the whole thesis: a tool
that checks the thing every calculator skips and refuses to quote a number the
household cannot receive. Rehearse it until it lands in under 15 seconds.

## 11. What we will not do today

Accounts. Saved reports. Installer leads. Emails. Multi-state. Income
verification. Any animation that costs more than 20 minutes.

The demo path is sacred. Everything else is a slide.
