# Requirements — Switchpoint

**Track:** Climate Tech · Challenge C2 "Cleaner, more affordable buildings"
**Version:** 1.0 · 2026-10-24
**Ship deadline:** 20:00 ET, same day

## Problem statement

A Massachusetts homeowner heating with oil is paying roughly $4,700–5,000 for a
winter that cost $2,800 a year ago. They have 68 days before the whole-home
rebate drops by up to $1,000, they have no idea whether a heat pump would save
them money, and the tools that exist either ask them to guess their own fuel use
(Mass Save's comparison calculator) or model incentives that expired in 2025
(Rewiring America's IRA-era planner). Nobody answers the actual question with
the actual bill.

## Personas

- **P1 — Oil homeowner, price-shocked.** 1,100 sqft 1938 colonial, 800 gal/yr,
  $4,984 last winter, no idea if a heat pump is a good deal.
- **P2 — Gas homeowner, curious.** Wants AC and lower carbon; suspects the money
  does not work. They are right, and we tell them.
- **P3 — 2–4 unit owner / landlord.** Pays for equipment, tenant pays electric.
  The split incentive is the reason nothing gets installed.
- **P4 — Judge with a phone.** Has 90 seconds and their own address.

---

## R1 — Address intake and parcel prefill

**WHEN** the user types a street address in Massachusetts, **THE SYSTEM SHALL**
resolve it to coordinates and a census tract, and prefill any assessor fields it
can find (year built, use code, town) with a per-field source badge.

**Acceptance**
- 1.1 Address resolves in < 1.5s or the manual form appears with no error state.
- 1.2 Prefilled fields are visually marked `assessor` vs `you` vs `bill`.
- 1.3 `YEAR_BUILT` is used only for the weatherization check and heating-load
  fallback; it never silently overrides a bill-derived number.
- 1.4 Address is never persisted server-side and never sent to the LLM.
- 1.5 A bad address produces "we could not find that parcel — continue manually",
  not a stack trace.

## R2 — Bill ingestion

**WHEN** the user uploads a photo or PDF of a heating-oil delivery receipt, a
propane receipt, or an electric/gas utility bill, **THE SYSTEM SHALL** extract
the fields needed for the calculation into a typed, editable object with a
confidence score per field.

**Acceptance**
- 2.1 Extracted fields: `utility`, `fuel`, `periodStart`, `periodEnd`, `days`,
  `gallons` | `kWh` | `therms`, `totalCharge`, `supplyCharge`, `deliveryCharge`,
  `pricePerUnit`, `rateClass`, `confidence`, `missingFields[]`.
- 2.2 The model is instructed to return `null` rather than guess; a plausibility
  pass then rejects out-of-range values (oil outside $5.20–$7.20/gal, electricity
  outside 18–50¢/kWh, more than 24 months old).
- 2.3 Every parsed field is editable. Editing a field recomputes the verdict in
  the same interaction, with no page reload.
- 2.4 Fields below 0.75 confidence block the verdict until confirmed.
- 2.5 The image is discarded after parsing. No disk write, no log line, no
  analytics event.
- 2.6 Manual entry is always available and equally fast: one fuel select, two
  numbers, one winter total.

## R3 — Live fuel and rate data

**THE SYSTEM SHALL** show current Massachusetts fuel prices sourced from a live
API where available, falling back to a dated snapshot, with the freshness
visible.

**Acceptance**
- 3.1 Headline oil and propane prices display with an as-of date and a
  `live | snapshot` badge.
- 3.2 Electricity default is 30.5¢/kWh, dates stamped, and user-overridable.
- 3.3 Seasonal heat pump rate is derived and labelled: `rate − $0.07`
  (Eversource/Unitil) or `rate − $0.04` (National Grid), valid Nov 1 – Apr 30.
- 3.4 A provider failure degrades to the snapshot and never blocks the verdict.
- 3.5 No price is ever displayed without a source date.

## R4 — Heating load and sizing

**THE SYSTEM SHALL** estimate annual delivered heat from the bill, derive a
design load, and recommend a system size in tons rounded to 0.5.

**Acceptance**
- 4.1 `deliveredMMBtu = fuelUnits × BTU_per_unit × AFUE / 1e6`.
- 4.2 `UA = deliveredBTU / (24 × HDD65)`; `designBTUhr = UA × (65 − T_design)`.
- 4.3 `tons = round0.5(designBTUhr / 12,000)`.
- 4.4 Without a bill, fall back to `sqft × 35–50 BTU/hr/sqft` and mark the result
  `assumption: envelope estimate`, high-end for pre-1950.
- 4.5 Tonnage never exceeds what the rebate cap implies without a warning.

## R5 — Rebate stack

**THE SYSTEM** SHALL compute the applicable rebate from tier, tonnage, install
year, weatherization status, and sizing bonus, and show which tier was chosen
and why.

**Acceptance**
- 5.1 2026 and 2027 tables both implemented; the year is chosen from the
  **install date**, defaulting to today.
- 5.2 Enhanced tier requires fuel ∈ {oil, propane, resistance}; gas homes render
  "not eligible for enhanced" with the reason.
- 5.3 Partial-home bonuses (+$500 weatherization, +$500 sizing) appear only where
  eligible and each is individually toggleable.
- 5.4 The cap is applied after bonuses, per tier.
- 5.5 A "what changes on Jan 1" line quantifies the delta in dollars for this
  household.

## R6 — Operating cost and honesty

**THE SYSTEM SHALL** compute the annual operating cost with the heat pump at both
the standard and the seasonal rate, and refuse to flatter a bad result.

**Acceptance**
- 6.1 `kWh = deliveredBTU / (3,412.14 × SCOP)`, default SCOP 2.7, adjustable
  2.3–3.2.
- 6.2 Savings may be negative and must render as a loss in red with the same
  visual weight as a gain in green.
- 6.3 `breakEvenElectricPrice` is computed and displayed whenever savings ≤ 0,
  expressed in ¢/kWh.
- 6.4 Natural gas homes are evaluated with gas AFUE 0.85 and the user's own
  $/therm; if the money does not work, the verdict is `DO_NOT_SWITCH_YET`.

## R7 — Payback, financing, cash flow

**THE SYSTEM SHALL** present payback in years and monthly cash flow under the 0%
HEAT Loan.

**Acceptance**
- 7.1 `netCost = installCost − totalRebate`, `paybackYears = netCost /
  annualSavings` when savings > 0.
- 7.2 Default install cost **$22,000** (source badge: Mass Save program data),
  editable.
- 7.3 HEAT Loan view: `monthly = netCost / 84` at 0%, shown next to monthly
  savings, with a cash-flow sentence either way.
- 7.4 Payback > 15 years triggers `DO_NOT_SWITCH_YET` regardless of other
  signals, with an explanation.

## R8 — Verdict

**THE SYSTEM SHALL** emit exactly one verdict from a closed set, with the reasons
that produced it.

**Acceptance**
- 8.1 `SwitchVerdict = SWITCH_NOW | SWITCH_BEFORE_DEC31 | DO_NOT_SWITCH_YET`.
- 8.2 Rule order, first match wins:
  1. `annualSavings <= 0` → `DO_NOT_SWITCH_YET`
  2. `paybackYears > 15` → `DO_NOT_SWITCH_YET`
  3. install year 2026 and `rebate2026 > rebate2027` → `SWITCH_BEFORE_DEC31`
  4. otherwise → `SWITCH_NOW`
- 8.3 Every verdict renders ≥ 2 supporting reasons and ≥ 1 caveat.
- 8.4 Verdict is deterministic: identical input, identical output, always.

## R9 — Provenance

**WHEN** the user clicks any number on the verdict screen, **THE SYSTEM SHALL**
reveal the formula, the substituted values, and the source with its date.

**Acceptance**
- 9.1 Every displayed figure has a provenance entry.
- 9.2 The source panel names the publisher, the document, and the as-of date.
- 9.3 `assumptions[]` is rendered, not hidden in a tooltip.

## R10 — Interactive map

**THE SYSTEM SHALL** provide an interactive map of Massachusetts heat exposure
that lets a user drill from state to town to tract, and shows what the 2027
step-down costs each area.

**Acceptance**
- 10.1 Base map renders without an API key. Tiles fail → static PNG + table view.
- 10.2 Choropleth layers, switchable: share of homes heating with oil;
  estimated annual oil spend per tract; households behind on the Jan 1 cliff.
- 10.3 Hover shows a tooltip with tract name, homes, oil share, homes on oil.
- 10.4 Click selects a tract and opens a side panel: homes, oil share, homes on
  oil, estimated annual oil spend, dollars of rebate lost on 2027-01-01, median
  year built, and a "use this tract" button that seeds the calculator.
- 10.5 Year scrubber 2026 ↔ 2027 recolors the layer and animates the aggregate
  dollar figure. On 2027 the map visibly loses money statewide.
- 10.6 Selecting a parcel within a supported town drops a pin and prefills the
  address form.
- 10.7 Keyboard accessible: tab to tract, arrow between tracts, Enter to select.
  A parallel table view exposes the same numbers to screen readers.
- 10.8 Palette is colour-vision-safe (single-hue sequential, luminance ramp) and
  passes contrast for label text.

## R11 — Build log

**WHEN** any feature is completed, **THE SYSTEM** (tooling, not the app) SHALL
record it in an append-only ledger and regenerate a human-readable log.

**Acceptance**
- 11.1 `node scripts/buildlog.mjs hook` syncs `@built F-NN` markers and rewrites
  `BUILDLOG.md`.
- 11.2 The log shows overall progress, per-phase progress, a "now" panel with the
  last three events, and the next five unbuilt features.
- 11.3 Duplicate markers for the same file and id do not duplicate events.
- 11.4 The generator is idempotent: running it twice changes nothing.
- 11.5 No dependency outside the Node standard library.

## R12 — Kiro evidence

**THE SYSTEM SHALL** be built with Kiro in a way that is visible in the
repository.

**Acceptance**
- 12.1 A `/.kiro` directory is committed at the repo root and is not gitignored.
- 12.2 Specs live in `.kiro/specs/switchpoint/` and the commit history shows
  spec → implementation.
- 12.3 Steering docs are real constraints the code obeys, not decoration.
- 12.4 Property-based tests exist for the calculation engine and are cited in
  the write-up.
- 12.5 At least one MCP integration or hook is described in the write-up with
  what it actually changed about the workflow.

## R13 — Demo reliability

**THE SYSTEM SHALL** produce the correct verdict with the network unplugged.

**Acceptance**
- 13.1 `?demo=1` disables all network calls and reads baked data only.
- 13.2 Three demo homes are seeded and reachable in one click each.
- 13.3 Cold start to verdict in < 3s on the venue wifi.
- 13.4 A recorded < 3-minute video exists before 19:30.

## R14 — Accessibility and equity

- 14.1 WCAG AA contrast on all text; verdict colour is never the only signal
  (icon + label + colour).
- 14.2 Full keyboard path through intake → bill → verdict → map.
- 14.3 The enhanced-incentive path is surfaced for income-eligible households
  instead of buried: up to $16,000 or no-cost turnkey.
- 14.4 Plain language at an 8th-grade reading level on the verdict screen.

## R15 — Privacy and disclaimers

- 15.1 No account, no cookie beyond the session, no analytics.
- 15.2 Disclaimer on every verdict: *Estimate only. Not a quote. A Home Energy
  Assessment determines eligibility and sizing.*
- 15.3 Never claim eligibility, approval, or a guaranteed saving.

## Out of scope (explicitly)

Accounts, saved projects, installer marketplace, scheduling, payments, income
verification, multi-state, ground-source sizing, commercial buildings, financing
beyond the HEAT Loan, emailed reports.
