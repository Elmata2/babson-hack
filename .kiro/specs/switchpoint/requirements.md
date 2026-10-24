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
  *Amended 2026-10-24 (F-101, `docs/fixes/2026-10-24-one-photo-intake.md`):* the
  model may return the **service ZIP and town** printed on a bill, never the
  street, account number or name. The street still reaches only the geocoder.
- 1.8 *(F-104)* A parcel record prefills only when its house number matches the
  address the user picked **and** its use code is residential (1xx, or mixed-use
  013/031). Exact-point and buffered matches get the same check. `units` is
  carried; with more than one unit the area is divided and marked an assumption.
- 1.5 A bad address produces "we could not find that parcel — continue manually",
  not a stack trace.
- 1.6 **Statewide, no allow-list.** Any of the 351 municipalities resolves.
  There is no demo borough: Berkshire, Barnstable and Suffolk addresses all work
  or all fail for a stated reason.
- 1.7 The parcel step is optional. When MassGIS is slow or the point lands on a
  right-of-way, the address still resolves to town and tract and the verdict
  still computes.

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
- 2.7 *(F-102)* `pricePerUnit` is computed in code from `totalCharge ÷ quantity`
  and marked `derived`. The model never divides (ADR-005). Amount Due is never
  used: under budget billing it is levelised.
- 2.8 *(F-101/F-102)* An electric bill that is not the heat source returns
  `role: "electricity"` and no heating fuel. It supplies the household's $/kWh,
  utility and income signal only.
- 2.9 *(F-102)* Gas rate class R-3/R-4 means gas heats the home; R-1/R-2 means it
  does not. R-2/R-4 or a printed discount line sets `lowIncomeSignal`, which the
  UI offers as "you may qualify" and never applies without the user's answer.
- 2.10 *(F-102)* CCF converts to therms with the printed therm factor, else 1.037
  flagged. A `season` period is partial unless the printed period spans ≥ 330 days.
- 2.11 *(F-103)* Single-bill annualisation weights the actual service days
  (`periodStart`–`periodEnd`), not the statement month. A printed history read
  from bars caps confidence at 0.75; a numeric table at 0.95.
- 2.12 *(F-107/F-108)* Photos are re-encoded in the browser (long edge ≤ 2000px,
  JPEG, < 1.5 MB, EXIF orientation applied) so no request meets Vercel's 4.5 MB
  limit. Up to three pages of one bill go to one vision call.
- 2.13 *(F-109)* When no field is below the confidence bar the bill applies
  without a confirm click, with Undo. A second "electric bill" slot is offered
  after a heating document.
- 2.14 *(F-106)* The annualisation method, its confidence and its note reach
  `/verdict` and are shown in provenance. "Change the numbers" returns every input.
- 2.15 *(F-110)* A PDF selected in bill upload is rendered to JPEG pages in the
  browser before any request. The three-page limit counts PDF pages and photos
  together; a longer or unreadable PDF gets a clear error. OpenRouter receives
  image pages only, and PDF bytes never leave the browser.

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
- 3.6 **WHEN** an address resolves to a town, **THE SYSTEM SHALL** resolve the
  electric sponsor from the MassGIS *Electricity Providers* layer and:
  - show the sponsor by name on the result;
  - derive the seasonal heat pump rate using that sponsor's rule
    (`−$0.07` Eversource/Unitil, `−$0.04` National Grid);
  - **refuse to quote a Mass Save electric rebate when the town is served only by
    a municipal light plant**, replacing the number with an explanation;
  - ask "which utility bills you?" when the town is mixed (municipal + IOU),
    never silently picking one.
- 3.6b **Cape Light Compact.** The source dataset publishes CLC's member towns as
  Eversource distribution. CLC *is* a Mass Save electric sponsor, so the system
  SHALL infer membership from Barnstable (25001) and Dukes (25007) counties, treat
  those towns as `cape_light`, keep `eligibleForMassSave: true`, set
  `seasonalRateRule: null` (no adjustment is published for CLC), and mark the row
  `inferred: true` so the UI shows "verify with Cape Light Compact". The inference
  is derived from the county table, never from a hand-typed town list.

  *Correction, 2026-10-24: an earlier version of this requirement treated CLC as
  ineligible. masssave.com lists Cape Light Compact as a sponsor, so refusing a
  rebate there would have been as wrong as quoting one in Wellesley.*
- 3.7 The utility determination renders its own source badge
  (`MassGIS · Electricity Providers`), like every other number.

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
- 4.6 *(F-103)* When a 12-month history is printed, non-heating use
  (`baseloadAnnual` ≈ lowest summer months × 12: hot water, cooking) is removed
  before 4.1. Without a history nothing is removed and the verdict says so.

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
- 10.9 An **equity layer** (MassGIS EJ2020 block groups) can be toggled over the
  choropleth: `PCT_MINORITY` and `LIMENGHHPCT` (limited-English households).
  Toggling it must not change the underlying heat numbers — it is a lens, not a
  filter, and must never be used to hide or down-rank tracts.
- 10.10 The tract panel names the utility sponsor(s) for that town and, where the
  town is served by a municipal light plant, says plainly that Mass Save electric
  rebates do not apply there.
- 10.11 Where the equity layer shows a high limited-English share, the panel links
  to the plain-language and translated view of the verdict (R14.4).
- 10.12 **Statewide coverage.** The map opens at state level and drills
  state → county → town → tract across all of Massachusetts. No town is special-cased
  and no region is omitted from the data.
- 10.13 County-level figures are shown before tract geometry loads, so the map is
  useful within 2s even on a slow connection. Geometry is lazy; a failed chunk
  load leaves the county view working.

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

## R16 — Organizer datasets and track alignment

**THE SYSTEM SHALL** build on the datasets the Hackachusetts data portal publishes
for the Climate track, and say so.

**Acceptance**
- 16.1 The MassGIS *Electricity Providers* and *EJ2020* layers are used for real
  (R3.6, R10.9), not cited and ignored.
- 16.2 Boston BERDO is used only as context in the pitch, never as a calculation
  input — it covers buildings above ~20,000 sqft, which is not our user.
- 16.3 The README reproduces the challenge text we answer
  (*C2 — Cleaner, more affordable buildings*) and names each dataset with its
  endpoint.
- 16.4 The submission states which challenge we entered and quotes the brief's own
  language ("up-front retrofit costs", "uneven access to efficiency programs",
  "affordability pressures") next to the feature that answers it.

## Out of scope (explicitly)

Accounts, saved projects, installer marketplace, scheduling, payments, income
verification, *(Addendum A, if approved: phone quotes from dealers and installers on
the user's request are in; booking, paying and lead sales stay out)*, multi-state, ground-source sizing, commercial buildings, financing
beyond the HEAT Loan, emailed reports.

---

# Addendum A — Decide, call, compare (proposal, pending review · 2026-10-24)

**Status:** proposal. Nothing below is approved for build until the team signs off.
**Reads with:** design §12–§14, tasks P8–P9, `../steering/voice-agent-rules.md`.

## Why this addendum exists

The verdict tells a household *whether* to switch. It does not help them act.
The two markets where a Massachusetts household loses the most money by not
shopping publish no prices at all: **heating-oil and propane dealers** (cash/COD
prices vary by dealer and by day and are given out by phone) and **heat pump
installers** (availability before the Dec 31 rebate step-down is the binding
constraint). A voice agent can make the six phone calls nobody makes.

Dutch comparison services set the bar for "easy to switch":

| Pattern (NL) | Where we saw it | What we take |
| --- | --- | --- |
| Postcode + house number is the whole intake | Consumentenbond Energievergelijker | address + bill stays the whole intake (R1, R2); the agent asks the user nothing new |
| One comparable number per offer, bonuses listed separately, price *after* the contract term shown | Independer (reported by duurzaamnieuws.nl) | every offer is an **annual cost at your usage**; teaser and after-term prices both shown (R20.4) |
| Usage pulled from the grid operator, not estimated | Gaslicht.com via iDIN | bill OCR today; Green Button download later (R24, verify MA availability) |
| "We arrange your switch", 14-day cooling-off | Consumentenbond Overstapservice, Gaslicht | a **switch kit**: who to call, what to say, what to have ready, rescission window (R20.8) |
| "100% independent since 1953" | Consumentenbond | ranking cannot be bought; no referral fees, no lead sales (R20.9) |
| Collective auction twice a year | Consumentenbond Energiecollectief | roadmap: a town-level oil collective (R24.3) |

## R17 — The switch decision is the user's

**WHEN** a verdict renders, **THE SYSTEM SHALL** offer the user an explicit choice
of what to do next, and take no outbound action until they choose.

**Acceptance**
- 17.1 Choices, closed set: `STAY` · `SHOP_FUEL` · `SHOP_SUPPLY` · `SWITCH_HEAT_PUMP`.
- 17.2 Which choices appear is a pure function of verdict, fuel and utility:
  - `SHOP_FUEL` only for oil and propane (gas and electricity have no dealer to shop).
  - `SHOP_SUPPLY` only in investor-owned-utility towns; never in municipal light
    plant towns, where there is no supply choice.
  - `SWITCH_HEAT_PUMP` always appears. Under `DO_NOT_SWITCH_YET` the verdict and
    break-even price are repeated directly above it.
- 17.3 Nothing is preselected. `STAY` has the same visual weight as the others and
  shows what would change the answer (break-even price, the Jan 1 delta).
- 17.4 `SHOP_SUPPLY` places no calls. Supplier offers are already published on
  Energy Switch Massachusetts; the panel compares them with Basic Service at the
  user's kWh (dashboard spec §3.4). Calling for a published number is theatre.

## R18 — Consent before any call

**WHEN** the user picks `SHOP_FUEL` or `SWITCH_HEAT_PUMP`, **THE SYSTEM SHALL**
show exactly what the agent will say about them and who it will call, and place no
call without an explicit confirm.

**Acceptance**
- 18.1 The disclosure lists every fact the agent may say: town and ZIP, fuel,
  annual volume rounded to the nearest 50 gal, delivery size (default 150 gal,
  editable), tank size if known, delivery window,
  and for installers home size in sqft and the estimated tons. Nothing else.
- 18.2 Never said on a call: name, street address, phone number, email, account
  number, payment details, income.
- 18.3 The provider list shows name, phone number, source and date of each entry,
  one checkbox per provider, at most **6 calls per session**.
- 18.4 A provider that wants to call back is told "the homeowner will contact you"
  and the quote is marked `needs_callback`.
- 18.5 Consent lives in the session only. Reloading the page clears it.

## R19 — Quote-calling agent (ElevenLabs)

**WHEN** the user confirms, **THE SYSTEM SHALL** place the calls through an
ElevenLabs agent over a Twilio number and return one structured quote per call.

**Acceptance**
- 19.1 The first sentence of every call, verbatim from steering: the caller is an
  automated AI assistant calling for a homeowner in {town}, the call is recorded
  and transcribed, may it continue. A "no" ends the call politely with status
  `declined`. Disclosure is our choice, not a legal shield: Massachusetts requires
  all-party consent to record (M.G.L. c.272 §99), and we treat the FCC's 2024 AI
  voice ruling as the spirit even though it targets consumer calls.
- 19.2 Questions by vertical:
  - **Fuel dealer:** cash/COD price per gallon at the user's delivery size, minimum
    delivery, delivery or small-load fee, card surcharge, price-cap or prebuy price
    for this winter and its fee, earliest delivery date, serves {town} yes/no.
  - **Installer:** Mass Save participating contractor yes/no, accepts the HEAT Loan
    yes/no, earliest site visit, can finish an install by **2026-12-31** yes/no,
    ballpark $/ton for a cold-climate air-source system (labelled ballpark).
- 19.3 Each call returns a typed `ProviderQuote`. Every field is nullable and
  carries its evidence: the extraction's rationale, plus the provider's own turns
  of the transcript, viewable in the drawer.
- 19.4 The agent never agrees to buy, books a delivery or visit, gives payment or
  personal details, states a competing price it was not handed by code (R21),
  claims to be human, or continues after "stop" or "take me off your list".
- 19.5 Calls end at **4 minutes**. Voicemail, IVR dead end and no answer end the
  call with a status; the agent leaves no message.
- 19.6 Calls are placed only within the provider's business hours (Mon–Fri
  08:00–17:00, Sat 08:00–12:00 ET). Outside them the UI says when it will call.
  Allowlisted team numbers are exempt, so the demo works on a Saturday evening.
- 19.7 Each call shows live status: `queued · ringing · in_progress · done ·
  no_answer · voicemail · declined · failed`.
- 19.8 Real businesses are called only when the server has
  `PROVIDER_CALLS_ENABLED=true`. Otherwise numbers come from a team allowlist.

## R20 — Comparison and "best deal"

**THE SYSTEM SHALL** rank quotes with deterministic code and show why the top one
is top.

**Acceptance**
- 20.1 Ranking lives in `lib/quotes`, pure and property-tested. The model
  extracts; code ranks (ADR-005 holds).
- 20.2 Fuel: `effectivePerGal = pricePerGal + deliveryFee / deliveryGallons`
  (+ card surcharge if the user pays by card); annual cost at the user's volume.
  `deliveryGallons` is the delivery size from R18.1. A dealer whose minimum is
  above it is flagged `min_above_delivery` and ranked at its minimum. Prebuy and
  price-cap offers are shown, never ranked: they are a bet on the winter, not a
  price.
- 20.3 Plausibility gate: oil $4.50–8.50/gal, propane $2.00–6.00/gal, installer
  $2,000–12,000/ton. Out of range → `unverified`: shown, never ranked.
- 20.4 Every row shows one comparable number (annual cost) and, separately, any
  prebuy fee, price-cap term or teaser price, with what it becomes after the term.
- 20.5 Each figure links to its evidence and the provider's transcript turns. Source badge:
  `Said on a call · {provider} · {date time}`.
- 20.6 Comparison against the DOER statewide average: "$0.41/gal below the state
  average, about $330 a year at 800 gal."
- 20.7 "Use this price" writes `effectivePerGal` into `unitPrice` and the verdict
  recomputes. If a cheaper oil price flips the verdict to `DO_NOT_SWITCH_YET`, the
  screen says so. That is the product working.
- 20.8 The top quote opens a **switch kit**: phone number, the exact sentence to
  say, what to have ready, and the label *Phone quote, not a contract. Confirm the
  price when you order.*
- 20.9 Ranking cannot be bought. No referral fees, no paid placement, no lead
  sales. Stated on the comparison screen.

## R21 — Ask for a better price ✂

**WHEN** round one has ≥ 2 ranked fuel quotes, the user **MAY** ask the agent to
call the next two and ask them to beat the best one.

**Acceptance**
- 21.1 The price cited is passed to the agent by code and must equal a ranked
  quote from this session. The other dealer is never named.
- 21.2 One round per session. Same consent rules as R18.

## R22 — Call records and privacy

- 22.1 No database (ADR-004 holds). The server is stateless: the browser holds
  the conversation ids and sends them with each poll; the ElevenLabs conversation
  is the record (ADR-010).
- 22.2 Twilio recording stays off (API default). ElevenLabs keeps audio and
  transcript by default, so: the agent's retention is set to the shortest the
  plan allows (verify the setting), and the browser deletes each conversation
  through `DELETE /api/calls` when the user presses Done or leaves the page
  (`sendBeacon`). Deletion is best effort; retention is the backstop.
- 22.3 Provider phone numbers are business lines from `data/providers/*.json`, each
  entry with a source and as-of date. No scraping of review sites.
- 22.4 ElevenLabs (and Twilio) become data processors for the call facts in
  R18.1. None of those identify a person, but the privacy line in `product.md`
  and `data-sources.md` ("removes the entire privacy surface") must be reworded
  to say so if this addendum is approved.

## R23 — Verdict by phone ✂

- 23.1 An inbound number where a resident can get the verdict by voice in English,
  Spanish, Portuguese or Haitian Creole.
- 23.2 The agent calls a server tool that runs `computeVerdict`. The model reads
  the number back; it never computes it.
- 23.3 Tied to R14 and the EJ2020 limited-English layer (R10.11).

## R24 — Watch and collective (roadmap, not today)

Needs a contact channel and stored state, so it breaks ADR-004 and the no-account
rule. Slide only.
- 24.1 Price watch: re-survey dealers when the DOER weekly price moves > 5%.
- 24.2 Supply watch: alert before Basic Service resets (Feb 1, Aug 1) and before a
  competitive contract ends.
- 24.3 Town oil collective: pooled gallons from many households, one agent call
  round to dealers, the Energiecollectief pattern applied to heating oil.
- 24.4 Usage import via Green Button download instead of bill OCR (verify which MA
  utilities support it before claiming it).

## R25 — Continuous integration

**THE SYSTEM SHALL** run the checks on every push and pull request, so a red
property test or a leaked key cannot reach `master` unnoticed.

**Acceptance**
- 25.1 GitHub Actions on push and PR to `master`: `npm ci`, `npm run check`
  (tsc + vitest including the property suite). Red blocks merge.
- 25.2 Build-log drift: run `node scripts/buildlog.mjs hook` and fail if
  `BUILDLOG.md` differs from the committed file.
- 25.3 Submission guard: `.kiro/specs/switchpoint/requirements.md` exists and
  `git check-ignore .kiro` finds nothing (R12.1).
- 25.4 Secret scan (gitleaks) on every push. ElevenLabs, Twilio, Anthropic and EIA
  keys never enter the repo.
- 25.5 Agent contract tests, no network: the agent prompt, first message and
  extraction schema live in `agents/quote-caller/`. Tests assert the first message
  contains the AI and recording disclosure, the schema matches `ProviderQuote`,
  and fixture transcripts (clean quote, cash vs card price, refusal, voicemail,
  hostile "$0.99/gal") extract and rank as expected.
- 25.6 ✂ ElevenLabs Agents Testing (simulation tests) runs only on PRs touching
  `agents/**`, only when the `ELEVENLABS_API_KEY` secret is present. Asserts: AI
  disclosure in turn one, no competing price stated unprompted, call ends on "stop".
- 25.7 ✂ On merge to `master`, the agent config in `agents/` is pushed to
  ElevenLabs, so the deployed agent is the reviewed one.
- 25.8 CI finishes in under 3 minutes. Vercel preview deploys per PR come from the
  Vercel Git integration and are not rebuilt in Actions.
