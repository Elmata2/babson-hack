# Switchpoint — Energy Map & "Your Bill" Dashboard Spec

**Status:** proposal · 2026-10-24 · prototype in `mvp/`
**Reads with:** `.kiro/specs/switchpoint/requirements.md` (R3, R10),
`.kiro/steering/mass-save-rules.md` (the only legal source of program numbers),
`.kiro/steering/data-sources.md`.

Visual reference: *Energy Simulate Parameters Dashboard* by George Railean on Dribbble
(shot 25486053). We borrow its layout and use none of its assets.

Run the prototype: `cd mvp && python3 -m http.server 4321`, then open http://localhost:4321.

---

## 0. Why this exists inside Switchpoint

Switchpoint answers one question: *should this household switch to a heat pump?*
The answer depends on the electricity bill. The bill depends on two things the
household mostly doesn't know: **who delivers** their power (fixed by address) and
**who supplies** it (a choice most people never consciously made). The dashboard
makes both visible on a map and per home, then feeds `utility` and `standardRate`
into `HeatingInput` (design §2.1).

It is the `/map` route (F-41…F-58) plus one new panel. Everything here obeys
the product rule: **no invented numbers**. Program and price figures come from the
steering docs or a dated source shown on screen. The demand and solar map layers
are explicitly mock until replaced (§6).

---

## 1. Demo path (60 seconds)

1. Open on Massachusetts at 6 PM. 351 towns stand as 3D columns, coloured by their
   **real** electric utility (MassGIS). Drag to rotate and tilt; press *Orbit*.
2. Type a Wellesley address. The camera flies in and the profile fills in. *Your bill* reads:
   "Your town's light plant both supplies and delivers your power… Mass Save electric
   rebates don't apply." This is Switchpoint's signature beat, now on the map.
3. Type a Worcester address and set *Competitive supplier, 21¢*. The panel computes
   "you pay $X/month more than Basic Service", with the formula. It names Energy
   Switch MA and the AG's $738.7M figure, and shows days left on the 2026 rebate tier.

---

## 2. What the consumer has to decide, and what they need to know

### 2.1 The decisions
| Decision | Who it applies to | Options |
|---|---|---|
| **Supply** | Investor-owned utility towns (Eversource, National Grid, Unitil) | Basic Service · Municipal aggregation · Competitive supplier |
| **Stay or leave a supplier contract** | Competitive-supply customers | Renew · cancel (termination fee) · return to Basic Service or aggregation |
| **Heating fuel** | Everyone | Keep current · heat pump (Switchpoint verdict) |
| **Rate plan** | Heat pump households, IOU towns | Seasonal Heat Pump Rate, Nov 1 – Apr 30 |
| **Programs** | Income-eligible, solar, EV households | Enhanced rebates/Turnkey · net metering · HEAT Loan |

**Delivery is not a choice.** It is fixed by address. In the 41 municipal-light-plant
towns (and parts of 9 mixed towns) the light plant also supplies, so there is no
supply choice and no Mass Save electric rebate.

### 2.2 What they need to know to switch
| Fact | Value shown | Source (on screen) |
|---|---|---|
| Their utility | per town, mixed towns ask | MassGIS Electricity Providers, fetched 2026-10-24 |
| Basic Service supply rate, Aug 2026 – Jan 2027 | Eversource 17.3¢, National Grid 16.074¢ / kWh; Unitil links to its rate sheet | Boston.com 2026-07-29; Unitil PDF |
| Basic Service reset cadence | every 6 months, DPU-approved | MA AG newsletter, summer 2026 |
| Aggregation rules | enrolled unless you opt out, no exit fee to opt out | MA AG newsletter; mass.gov municipal aggregation |
| Competitive supply track record | residential customers paid **$738.7M** more than Basic Service, Jul 2024 – Jun 2025 | MA AG 2026 Competitive Supply Report |
| Market split, Mar 2026 | 51% aggregation · 26.6% Basic Service · ~22% competitive | MA AG newsletter, summer 2026 |
| Where to compare offers | Energy Switch Massachusetts | energyswitchma.gov |
| All-in average price | 30.49¢/kWh, Jul 2026 | EIA (steering §2) |
| Seasonal Heat Pump Rate | rate − $0.07 (Eversource/Unitil), − $0.04 (National Grid) | Mass Save (steering §2) |
| Heat pump rebate cliff | $2,650/ton cap $8,500 → $2,350/ton cap $7,500 from 2027-01-01 | Mass Save (steering §1) |
| Enhanced / Turnkey | up to $16,000 or no cost; check eligibility 888-714-3990 | Mass Save (steering §1, §5) |
| HEAT Loan | 0%, up to $25,000, not a rebate | Mass Save (steering §2) |
| Federal 25C | expired 2025-12-31 | steering §2 |

### 2.3 What they need from their own bill
Supplier name (if it names the utility, they're on Basic Service) · supply rate in
¢/kWh · contract end date · early termination fee · monthly kWh.
The app never asks for the account number.

### 2.4 Policy watch (show as a note, verify before demo)
The AG has filed to end individual residential competitive supply (H 3534 / S 2255).
The House's April 2026 energy bill instead lets communities ban it locally. Neither
is confirmed as law here. Treat this as "pending" and re-check before quoting it.

---

## 3. Features

### 3.1 Map, full 3D
- Drag to pan, right-drag / ctrl-drag / two-finger to rotate and tilt, wheel to zoom.
  Pitch goes up to 85°, bearing all 360°.
- On-screen cluster: rotate ±45°, tilt ±15°, reset, **Orbit** (slow continuous
  rotation that stops on any interaction and is off under reduced motion).
- Layers: demand columns, provider territories, solar sites, labels. Colour by
  provider (Eversource / National Grid / Unitil / Municipal / Mixed) or intensity.
- Timeline 24 h with play. Polar load clock. Region select (ISO-NE zones).

### 3.2 Search
- One box: town typeahead over all 351 towns, or a street address.
- Address → US Census geocoder (the provider already chosen in data-sources.md) →
  point-in-polygon → town → utility. Fly in, drop a pin, select.
- Failure says "pick your town instead". It never shows a stack trace or a guess.
- "Use as my home" writes the result into the profile.

### 3.3 Profile ("My home")
Town/address · utility (asks when mixed) · heating fuel · home type · monthly kWh ·
current supply (Basic / aggregation / competitive / not sure) · supplier rate,
contract end, termination fee · solar · EV · income-eligible.
Stored in `localStorage` only. A "Clear" button wipes it. This is consistent with
ADR-003 (no database, nothing server-side).

### 3.4 "Your bill" panel
Tabs on the right panel: **Grid** | **Your bill**. Your bill has five blocks:
1. **Who delivers**: utility plus "fixed by your address". Municipal-only towns stop here
   with the light-plant explanation.
2. **Who supplies**: the three options with rates, rules and links. A personalised
   comparison runs when the profile has a competitive rate:
   `Δ$/month = (yourRate − basicRate) × kWh / 100`, with the formula expanded.
3. **Before you switch**: the bill checklist from §2.3.
4. **Heat pump angle**: seasonal rate, the rebate cliff with days left, the gas-home
   enhanced-tier exclusion, income path, HEAT Loan, 25C expired, solar/EV prompts.
5. **Disclaimer**: *Estimate only. Not a quote. A Home Energy Assessment determines
   eligibility and sizing.*

Every figure carries a publisher · date badge (R3.5, R9).

---

## 4. Data

| Data | Status | Source |
|---|---|---|
| Town boundaries (351) | **real**, baked | US Census 2023 cartographic county subdivisions, simplified with mapshaper |
| Utility per town (351) | **real**, baked to `mvp/utilities.json` | MassGIS `AGOL/ElectricityProviders/MapServer/0` (organizer portal dataset) |
| Address → coordinates | **live** | Census geocoder, JSONP from the browser (verified 2026-10-24) |
| Basic Service rates | real, dated constants | see §2.2; refresh Feb 1 / Aug 1 |
| Program numbers | real | `.kiro/steering/mass-save-rules.md` |
| Hourly demand, solar per town | **mock** | to be replaced by Mass Save Data town usage, ISO-NE zonal load, DOER solar |
| Aggregation per town | **not shown** | DPU list has no API; link out rather than guess |

Utility counts from the live layer: 158 National Grid, 130 Eversource, 41 municipal,
4 Unitil, 1 Nantucket Electric, 17 mixed.

---

## 5. Integration with the Switchpoint app

- `/map` uses this dashboard's camera, search and layers. The team's tract heat-
  exposure choropleth (R10.2) becomes another layer in the same gallery.
- Search shares `app/api/geocode` in the Next app. The JSONP call is prototype only.
- Profile fields map to `HeatingInput`: `town`, `utility` (`eversource | nationalgrid |
  unitil | mlp | mixed`), `fuel`, and `standardRate` from the selected supply option.
- The utility parser follows data-sources.md: `{ sponsors[], hasMunicipal, mixed }`,
  and never takes the first string.

---

## 6. Build order

| # | Task | Done when |
|---|---|---|
| 1 | 3D camera + orbit | rotate/tilt/reset work by mouse, touch and buttons |
| 2 | Real utilities | colours and bars come from utilities.json; mixed towns marked |
| 3 | Search | town typeahead + address → town for Boston, Worcester, Wellesley, Pittsfield |
| 4 | Profile | persists across reload; works with storage blocked |
| 5 | Your bill | Wellesley shows the MLP message; Worcester competitive shows a signed Δ$ |
| 6 | Port into Next `/map` | shares geocode route and calc types |
| 7 | Replace mock demand | Mass Save Data town totals + ISO-NE shapes |

---

## 7. Scaling beyond Massachusetts (note, not v1)

The product is MA-only today (scope fence). Design so a second jurisdiction is
configuration, not a rewrite:

- **`Jurisdiction` config** per state/province: boundaries file, utility-territory
  source, supply-market model, program rules file, price sources, geocoder.
- **Supply-market model as data**, not code. Examples:
  - *MA, CT, NY, PA, IL*: default service + retail choice + (some) community aggregation
  - *Monopoly states*: one supplier, no choice block
  - *Ontario*: regulated price plans (time-of-use / tiered / ultra-low overnight) instead of supplier choice
  - *Alberta*: Rate of Last Resort vs retailer
- **Program rules per jurisdiction** live in their own steering file, the same
  pattern as `mass-save-rules.md`, so the "no invented numbers" rule scales.
- Geocoder abstraction: Census for US, a national or provincial service for Canada.
- Units and currency come from jurisdiction config (¢/kWh USD vs CAD).
