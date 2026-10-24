---
inclusion: always
---
# Steering — Massachusetts program rules (source of truth)

This file is the only place program numbers are allowed to come from. If a
number is not in this file, the agent must not emit it. Implementation lives in
`data/rules/*.json`; this document explains and cites it.

Every value here was read from the official source on **2026-10-24**. Anything
not confirmed that day is listed under "Do not claim".

---

## 1. Air-source heat pump rebates (residential)

| Tier | 2026 (installs 2026-01-01 → 2026-12-31) | 2027 (installs on/after 2027-01-01) |
| --- | --- | --- |
| Whole-home | **$2,650/ton**, cap **$8,500** | **$2,350/ton**, cap **$7,500** |
| Partial-home | **$1,125/ton**, cap **$8,500** | **$1,000/ton**, cap **$7,500** |
| Basic | **$250/ton**, cap **$2,500** | unchanged |

- Tonnage = AHRI **cooling** capacity ÷ 12,000 BTU. Not heating capacity.
- Partial-home bonuses: **+$500** weatherization (assessment + work within 1 year
  before / 6 months after), **+$500** sizing (equipment sized to 90–120% of total
  heating load at design temp, per ACCA Manual J, with the load calc submitted).
- Income-based enhanced: **up to $16,000**, or **no cost through Turnkey**.
  Pre-existing fuel must be **oil, propane, or electric resistance**. Gas homes
  are not eligible for the enhanced tier.
- Basic tier applies when no fossil fuel or resistance heat is displaced
  (upgrading an existing heat pump, new addition, summer home). Bonuses do not
  apply. A basic rebate can stack on top of whole/partial for unconditioned
  space, total capped **$8,500/account**.
- Whole-home conditions: sufficient weatherization (built ≥2000, **or**
  assessment shows <$1,000 recommended, **or** post-2013 recommendations
  completed); one whole-home rebate per account; signed Whole-Home Verification
  Form; full-time winter occupancy; ENERGY STAR Cold Climate equipment;
  contractor in the Mass Save Heat Pump Installer Network.
- Gas homes **are** eligible for standard whole-home/partial-home rebates where
  the gas sponsor is Berkshire Gas, Eversource, Liberty, National Grid, or
  Unitil. (Common error: "gas homes are excluded." Only the enhanced tier is.)
- Municipal light plant customers are **not** served by Mass Save electric
  rebates. Different program or nothing.

## 2. Money and rates

- **Average whole-home installation cost: $22,000.** Mass Save program data,
  installs completed 2022 (`masssave.com` cost example).
- **HEAT Loan: 0%, up to $25,000**, for qualified improvements. Not a rebate.
  The $25,000 maximum is lifetime across a customer's upgrades, effective
  2025-01-01 (masssave.com HEAT Loan page, read 2026-10-24). That page does not
  state a term. A participating lender, Energy Credit Union
  (`energycreditunion.org/mass-save-heat-loan`, read 2026-10-24), lists
  "terms up to 7 years" / up to 84 months at 0%, with terms "based on finance
  amount" and subject to credit approval. We therefore **assume the longest
  term, 84 months**, and say so wherever it is shown.
- **Seasonal Heat Pump Rate:** electric usage **Nov 1 – Apr 30**. Estimate from
  your own rate using Mass Save's published method:
  - Eversource / Unitil: `rate − $0.07`
  - National Grid: `rate − $0.04`
- **Massachusetts residential electricity: 30.49¢/kWh** all-in, July 2026 (EIA,
  Electric Power Monthly). 29.61¢ Oct 2026 (ElectricChoice state table). Treat
  30.5¢ as the default and always date-stamp it.
- **Federal 25C / 25D: expired.** Property placed in service after 2025-12-31
  earns $0. Do not show a federal credit line except as "expired".

## 3. Deadlines

- Equipment installed **2026-01-01 → 2026-12-31**.
- Rebate form and documentation received by **2027-02-28**.
- From **2026-10-01**, serial numbers are a required field and a legible
  nameplate photo is required per outdoor unit.

## 4. Fuel prices (MA DOER telephone survey, week of 2026-10-19)

| Fuel | Avg | 10th pct | 90th pct | Year ago |
| --- | --- | --- | --- | --- |
| Heating oil ($/gal) | **6.23** | 5.77 | 6.82 | 3.55 |
| Propane ($/gal) | **3.91** | 3.19 | 5.37 | 3.60 |

Winter 2026/27 season averages: oil **$6.17**, propane **$3.89**.
These bracket your sanity checks: a bill claiming $2.80/gal oil is a parse
error, not a bargain.

## 5. Do not claim (unverified as of 2026-10-24)

- **Income thresholds.** Published by household size in
  `data/rules/income-limits-2026.json` (Mass Save, 2026 – 2027 Heating Season,
  https://www.masssave.com/residential/rebates-offers-services/income-based-offers,
  read 2026-10-24). Statewide table; Mass Save says limits can vary by area. Never
  invent a FPL or SMI percentage. Treat a household within 5% of its limit as
  `check eligibility` and give the verification number (888-714-3990).
- **Natural gas $/therm** for a specific home. Derive from the user's bill or
  leave blank.
- Any **"Super HEAT" $50,000** loan variant. The official page says $25,000.
- **MassCEC HOMES/HEAR** rebate availability. Unconfirmed; leave out.
- Any **statewide oil-consumption-per-household** statistic. Use the user's bill
  or a labelled assumption.
- Any claim that this product determines eligibility. It estimates. A Home
  Energy Assessment decides.

## 6. Neighboring programs (mention, do not compute)

- **NEHPA** (New England Heat Pump Accelerator): midstream instant discount paid
  to distributors, stackable with Mass Save, $450M EPA grant, administered by
  VEIC. Real, but the amount varies by SKU — show a link, never a dollar figure.
- **Mass Save Home Energy Assessment**: no cost; the mandatory next step for the
  weatherization requirement and the HEAT Loan.

## 7. Copy rules

- "Estimate" not "quote". "Likely eligible" not "you qualify".
- Always show the source date next to a price.
- Every verdict screen carries: *Estimate only. Not a quote. A Home Energy
  Assessment determines eligibility and sizing.*

## Who to contact (verdict "What to do next")

Machine-readable copy: `data/rules/contacts-2026.json`, rendered by `lib/verdict/contacts.ts`.
Every entry was read on **2026-10-24** from the official page named below. A phone appears
only where the page prints one. No email addresses are listed: these organisations publish web
forms and pages, not addresses.

| Contact | Phone | Official page |
| --- | --- | --- |
| Mass Save, book a no-cost Home Energy Assessment | 866-527-SAVE (7283) | https://www.masssave.com/en/residential/rebates-offers-services/home-energy-assessments |
| Mass Save Heat Pump Installer Network finder | none listed | https://www.masssave.com/en/residential/find-a-contractor/find-a-heat-pump-installer |
| Mass Save, heat pump rebate questions | 888-855-0340 | https://www.masssave.com/en/residential/rebates-offers-services/heating-and-cooling/heat-pumps/air-source-heat-pumps |
| Mass Save HEAT Loan | none for the loan (866-527-7283 is for the required verification only) | https://www.masssave.com/en/saving/residential-rebates/heat-loan-program |
| Mass Save, income verification for enhanced offers | 888-714-3990 | https://www.masssave.com/en/residential/rebates-offers-services/income-based-offers/save-with-enhanced-incentives |
| Energy Switch Massachusetts (DPU), compare supply | none listed | https://www.energyswitchma.gov |
| Eversource | none shown without a town; hours Mon-Fri 8-6 ET | https://www.eversource.com/residential/contact-us |
| National Grid, electricity billing and general (Mon-Fri 7am-7pm) | 1-800-322-3223 (read in a browser; the page blocks automated fetches) | https://www.nationalgrid.com/us/ma/contact-us |
| Unitil | 888-301-7700 | https://unitil.com/contact/contact-customer-service |
| Cape Light Compact, general questions only (delivery and bills stay with Eversource) | 508-375-6644 | https://www.capelightcompact.org/program/overview-rates/ |

Omitted: municipal light plant numbers (41 plants, none sourced; the screen says to use the
number on the bill) and heating-fuel dealer contacts (named from the bill only, never invented).

---

## Machine-readable copy (loaded with this file)

The tables above and the JSON below must say the same thing. Kiro reads both; if
they disagree, this document wins and the JSON is the bug. `lib/calc/rules.ts`
parses these files at import and throws on a malformed row, and the
`rules-regression` hook re-runs the anchor tests whenever one is saved.

#[[file:data/rules/heat-pump-2026.json]]

#[[file:data/rules/heat-pump-2027.json]]
