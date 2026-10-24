# Fix — one photo of one Massachusetts bill becomes advice tied to that household

**Status:** implemented on `master`; automated checks passed · 2026-10-24
**Feature ids:** F-100–F-119 (new block, reserved in `tasks.md`)
**Amends:** R1.4, R2.1, R2.2, R2.4, R4 (`requirements.md`) · design §2.4, §15 (`design.md`)
**Evidence:** three audits on 2026-10-24 — pipeline trace (code), MA bill formats
(MA AG "Understanding Your Electric and Gas Bills", 13 Feb 2026, annotated Eversource
and National Grid sample bills), and a click-through of `/start` at 390px and 1280px.

---

## 1. The problem in one paragraph

The vision prompt reads about twelve fields from a bill. Three of them — fuel,
annual units, price — reach the calculator. Everything that makes the advice
*specific to this household* is dropped or was never asked for: which utility
sends the bill (Mass Save vs a municipal light plant), whether the gas rate class
says the house heats with gas, whether the bill shows a low-income discount
(enhanced rebates), the household's real $/kWh, and when the service period
actually ran. Meanwhile the form asks the household for numbers nobody knows
("gallons a year", "rebate tier") and, for one tested address, prefilled the
wrong house.

## 2. Findings, ranked

### Wrong numbers (correctness)

| # | Finding | Effect | Fix | Id |
|---|---|---|---|---|
| W1 | Parcel house-number check only runs on buffered matches. "12 Adams St, Dorchester" prefilled "34 Adams ST", use code 985, 6,327 sqft, badged *Assessor*. | Wrong house's size reaches the verdict URL. | Check house number on every match; refuse non-residential use codes (3xx/4xx/9xx); carry `units`. | F-104 |
| W2 | An electric bill can only come back as `fuel: "resistance"`. Applying it switches an oil/gas home to resistance and HDD-scales the household's lights as if they were heat. | Wrong fuel, wrong annual load. | `role: 'heating' \| 'electricity'`. A non-heating electric bill supplies $/kWh, utility and income signal — never a fuel. | F-101/F-102 |
| W3 | All-in price was moved into the prompt in F-79 ("divide total by quantity") — correct number, wrong place: ADR-005 forbids model arithmetic. | Unauditable price; silent if the model divides the wrong total (e.g. a levelised budget-billing amount). | Extract `total_charge`, `supply_charge`, `delivery_charge`, `quantity`; divide in `readBill`, `derived: true`. Never use Amount Due. | F-102 |
| W4 | Annual gas/oil totals include hot water and cooking (≈150–250 therms/yr) but `computeVerdict` treats all of it as space heat. | Tonnage and savings overstated. | `baseloadAnnual` from the summer months of a printed history; the form receives space-heating units. | F-103 |
| W5 | `hdd_scaled` uses the *statement* month. A bill dated 3 Feb covers January: Feb share 0.169 vs Jan 0.191 → ~13% high; 35-day periods another ~17%. | Annual figure off by up to ~30%. | Extract `period_start/end`; weight daily heating shares across the service days. | F-103 |
| W6 | `printed_history` confidence ceiling 0.95 regardless of chart type. Eversource prints **bars only** (no numbers); National Grid prints a numeric 13-month table on page 2. | Over-claimed confidence on eyeballed bars. | 0.95 only for `history_kind: numbers`; 0.75 for bars. | F-103 |
| W7 | CCF not in the unit enum; `unit: null` lets CCF pass as therms. | ~3% off, silently. | Accept CCF; convert with the printed therm factor (Eversource prints it), else 1.037 flagged. | F-102 |
| W8 | `billing_period: "season"` counted as a full year. | Season-to-date oil statement passes as annual. | Partial unless the printed period spans ≥330 days. | F-102 |
| W9 | `countyFips` and `heating` never sent from the client; every bill annualised on the Boston climate. Worcester has ~12% more degree days. | Western/central MA homes under-sized. | Client sends both; copy names the county. | F-103/F-108 |
| W10 | Photos > 4.5 MB hit Vercel's body limit → non-JSON 413 → "upload did not reach the reader". HEIC 415. EXIF rotation ignored. | Most iPhone photos fail in production. | Client re-encode: long edge ≤2000px, JPEG, <1.5 MB, `imageOrientation: from-image`. | F-107 |

### Information we print-read but throw away

| On the bill | What it unlocks | Id |
|---|---|---|
| Utility name/logo | Mass Save vs MLP vs Cape Light Compact; resolves the mixed-town sponsor question with no question asked | F-101 |
| Gas rate class R-3/R-4 "Residential Heating" vs R-1/R-2 | Gas is / is not the heating fuel | F-102 |
| R-2/R-4, "Assistance Rate Discount", "Discount 25%" | Likely income-eligible → offer enhanced rebates (signal, not proof — Mass Save verifies income) | F-102/F-105 |
| Service ZIP + town (never the street) | Town, county, climate, sponsor without typing | F-101/F-105 |
| Supplier name (Basic Service / competitor / aggregation) | `lib/supply` comparison — today only on `/map` | F-101 |
| Electric total ÷ kWh | The household's real electricity price for heat-pump running cost, instead of the statewide EIA figure | F-106 |
| Actual vs estimated read; budget billing | Confidence; never price from Amount Due | F-101/F-102 |

### Friction (UX)

| # | Today | Fix | Id |
|---|---|---|---|
| U1 | Bill upload is a dashed "Or read the bill" box halfway down a ~2,800px form. | Bill-first: one primary "Snap your heating bill" card at the top, camera on phones. | F-105/F-107 |
| U2 | One file only; no `capture`; electric + gas impossible. | Up to 3 pages in one read; "+ Add your electric bill" second slot. | F-108/F-109 |
| U3 | Extra "Use these numbers" click even when everything is confident. | Auto-apply when nothing is low-confidence; Undo link. Low-confidence fields must still be touched (R2.4). | F-109 |
| U4 | "Fills per season" answer re-uploads the image for a second vision call. | Re-annualise client-side with a pure helper. | F-103/F-109 |
| U5 | 351-option Town select always visible; section says "Optional" but blocks submit. | Town only on lookup failure; labels match validation. | F-105 |
| U6 | Rebate tier `<select>` in program jargon; install-year toggle. | "Whole system or adding to it?" + "Income under the Mass Save limit?" (yes/no/not sure); install year defaults to now. | F-105 |
| U7 | "← Change the numbers" drops every input. | Round-trip the query string; `/start` hydrates from it. | F-106 |
| U8 | Method/confidence vanish after Apply; verdict shows an HDD-scaled estimate as if the user typed it. | `m`, `mc`, `mn` params; verdict lists them in provenance. | F-106 |
| U9 | Duplicate address suggestions. | Dedupe by line1 + postcode. | F-104 |
| U10 | OpenRouter rejects raw PDF, though upload offers PDF. | Render PDF pages to JPEG in browser; count them against the three-page limit. | F-110 |

## 3. Target flow

```
/start
  [ 📷 Snap your heating bill ]            ← camera on phones, up to 3 pages
  [ Upload PDF or photos ]
  No bill handy? Enter it yourself ↓       ← address + fuel chip + manual numbers

  Reading… chips land: Eversource ✓  Natural gas ✓  13 months ✓

  Here's what we found
   Natural gas (R-3 heating rate)          bill
   Worcester 01602                         bill
   Eversource → Mass Save                  bill
   812 therms/yr of heat                   from your 13-month chart, hot water removed
   $2.11/therm (all charges ÷ therms)      bill
   Built 1900 · 3 units                    assessor
   ⋯ check?  fields at low confidence are dotted and must be touched
   How we got this number ▸

   + Add your electric bill  (sets your real $/kWh)

  Whole system or adding to it?   ( whole )  ( adding )
  Income under the Mass Save limit?  ( yes )  ( no )  ( not sure )
  [ Show my verdict ]
/verdict  — provenance lists the method, its confidence and the bill-derived rate
          — "Change the numbers" returns to the filled card
```

## 4. Decisions taken (flag to overturn)

1. **R1.4 relaxed to ZIP + town.** The model may return the service ZIP and town;
   never the street, account number or name. ZIP is enough for county, climate,
   sponsor and the Cape Light Compact case. The street still never leaves the
   browser except to the Census geocoder, as today.
2. **Price is arithmetic, so it is code.** F-79's prompt sentence is replaced by
   extracting the printed totals (ADR-005).
3. **Low-income discount = signal, not eligibility.** Copy says "you may qualify";
   the tier only changes if the user answers yes. Gas-heated homes never get the
   enhanced tier (Mass Save excludes them).
4. **Baseload removed only when a history proves it.** No history → no subtraction,
   and the verdict says hot water is included.
5. **Ids:** F-100–F-119 reserved for this branch to stop a third collision.

## 5. Alignment with `design.md` / Addendum B (`/onboarding`)

Addendum B §3.3–3.4 already wants photo/PDF/HEIC, `capture="environment"`, an
editable verify card with source badges, and low-confidence fields that block
Confirm. This fix builds those pieces on the anonymous `/start` path so
`/onboarding` step 2–4 can reuse the same components. Where they differ:

| Addendum B says | This fix | Resolution |
|---|---|---|
| Utility "from address → MassGIS; asks for mixed towns" | Utility read from the bill first; address/MassGIS second | Bill wins when legible — it is the household's own document. Ask only when both are missing. |
| Bill image → Anthropic (privacy table §6) | F-79 added an OpenRouter fallback (`google/gemma-3-12b-it`) | Privacy table and `product.md` must name both readers. **Open.** |
| One bill | Heating document + optional electric bill | Addendum B's electricity profile needs the electric bill; the heat-pump verdict needs the heating one. Two slots. |
| Silent on baseload, service dates, body-size limit, parcel guard | Covered (W1, W4, W5, W10) | Add to Addendum B acceptance when it is reviewed. |

## 6. Not verified (do not hardcode)

- Real household bill read: one synthetic gas statement passed through the live
  OpenRouter reader, including total ÷ therms and Worcester County annualisation.
  A photographed household statement still needs a manual check.
- Phone-width browser walkthrough: no browser automation surface was available
  in this continuation. Production compilation passed with webpack; Turbopack
  could not resolve the worktree's symlinked `node_modules` outside its root.
- How the Nov-2025 seasonal heat-pump rate is labelled on a bill (a winter
  delivery rate near $0.02/kWh is the tell).
- Whether any MA gas bill prints degree days.
- Eversource electric rate codes beyond R-1/R-2.
- Oct-2026 MA propane price; the ~$6.12/gal oil figure seen on YCharts — confirm on EIA/DOER.

## 7. Not in this fix

Green Button CSV/XML upload (both utilities offer it — good next input), the
"winter monthly bill ≈ $" no-bill estimator, budget-billing true-up maths, MLP bill
formats.
