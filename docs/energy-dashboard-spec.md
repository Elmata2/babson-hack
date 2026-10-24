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
steering docs or a dated source shown on screen. The Energy lens shows real public
data, each figure with its source and date on screen (§4, F-75).

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
- Layers: residential-use or installed-solar columns, provider territories, solar capacity, labels (top 15 towns). Colour by
  provider (Eversource / National Grid / Unitil / Municipal / Mixed) or intensity.
- Timeline 24 h with play. Polar clock of real ISO-NE zonal load for a winter or summer day. Region select (ISO-NE zones).

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

### 3.5 Two views: **Street** (find your home) and **Energy** (see the grid)

One map, two basemaps, one toggle. Finding an address and reading energy data are
different jobs, and one dark 3D style does both badly.

| | **Street** view | **Energy** view (today's map) |
|---|---|---|
| Purpose | Find and confirm *your* address | Compare towns, utilities, load, solar |
| Basemap | OpenStreetMap, light, street-level: roads, house numbers, building footprints | CARTO Dark Matter, no labels |
| Camera | Flat to 30° pitch, zoom 15–18 | 3D, pitch up to 85°, zoom 7–11 |
| Energy data | Light only: selected town outline + utility chip + pin | Full: columns, territories, solar, timeline, polar clock |
| Right panel | **Your bill** tab opens by default | **Grid** tab by default |

**Basemap:** OpenFreeMap (`tiles.openfreemap.org`, styles `liberty` / `positron`).
It serves OSM data as vector tiles, needs no key, and works with MapLibre. Don't
use `tile.openstreetmap.org` raster tiles; OSM's tile policy rules out app traffic.
The team's design already names Positron for `/map` (F-41), so `positron` keeps that
continuity. *Verify the style URLs and the attribution string before shipping.*

**The whoosh (search → street):**
1. The user submits an address or ZIP from the Energy view.
2. `flyTo` from the current camera to the result: curve 1.4, about 1.6 s, pitch eases
   to 30°, bearing to 0.
3. When the flight passes zoom 12, the basemap crossfades from Dark Matter to OSM
   (about 300 ms) and the energy columns fade out. Pin drops at the end.
4. Under `prefers-reduced-motion`: `jumpTo` and an instant swap.

**Back to energy:** the "Energy" toggle, or zooming out past 11, flies back to the
town at pitch 55° and restores the columns. The selected town stays selected across
both views.

**Toggle:** a two-segment control, top-centre: `Street | Energy`. It's keyboard
reachable, uses `aria-pressed`, and the current view is also shown in text.

**Search inputs it accepts:**
- Town name: local typeahead (351 towns), flies to the town in the Energy view.
- Street address: `/api/geocode` → Street view at zoom 17.
- **ZIP / postal code** (5 digits): local lookup against a baked table of MA ZIP
  code tabulation area (ZCTA) centroids from the Census gazetteer (~540 rows, about 15 KB). It needs no
  network call. ZIPs can span towns: fly to the centroid, then resolve the town by
  point-in-polygon. If the centroid sits in a different town from the one the user
  expects, show "This ZIP covers parts of more than one town. Pick yours."
  The Census geocoder only matches full addresses, so it can't do ZIP-only search.

**Implementation note:** MapLibre `setStyle` drops custom sources and layers.
Either re-add the energy sources and layers on `style.load`, or keep both basemaps
in one style and crossfade with `raster-opacity` / layer visibility. The second
avoids a flash. Run the motion through `emil-design-eng` / `animate` before
writing it.

---

## 4. Data

| Data | Status | Source |
|---|---|---|
| Town boundaries (351) | **real**, baked | US Census 2023 cartographic county subdivisions, simplified with mapshaper |
| Utility per town (351) | **real**, baked to `mvp/utilities.json` | MassGIS `AGOL/ElectricityProviders/MapServer/0` (organizer portal dataset) |
| Address → coordinates | **live** | Team route `GET /api/geocode?q=` → `lib/geocode` (Census geographies endpoint). Prototype still calls Census via JSONP until it moves into the Next app |
| ZIP → point | to bake | Census gazetteer ZCTA file, MA rows only |
| Street basemap | live tiles | OpenFreeMap (OSM data), no key |
| Basic Service rates | real, dated constants | see §2.2; refresh Feb 1 / Aug 1 |
| Program numbers | real | `.kiro/steering/mass-save-rules.md` |
| Residential electricity use per town | **real**, baked | Mass Save "Town-by-Town Savings in 2023", residential MWh. 299 of 351 towns; 50 municipal light plants and 2 privacy-suppressed towns have no figure |
| Installed solar per town | **real**, baked | MassCEC Production Tracking System, DC MW as of 2025-01-14. Self-reported; SMART-only systems from 2022 to 2024 are under-captured |
| Hourly load per zone | **real**, baked | ISO-NE zonal demand via EIA-930, NEMA / SEMA / WCMA, Jan 15 and Jul 15 2026. No hourly per-town load or solar exists, so columns are static |

| Aggregation per town | **not shown** | DPU list has no API; link out rather than guess |

`scripts/bake-town-energy.mjs` joins the three to the town polygons into `public/data/ma-town-energy.json`; the cleaned CSVs and parsers are in `data/sources/energy` and `scripts/energy`.

Utility counts from the live layer: 158 National Grid, 130 Eversource, 41 municipal,
4 Unitil, 1 Nantucket Electric, 17 mixed.

---

## 5. Integration with the Switchpoint app

- `/map` uses this dashboard's camera, search and layers. The team's tract heat-
  exposure choropleth (R10.2) becomes another layer in the same gallery.
- Search uses the team's `GET /api/geocode?q=` route. Its response already returns
  `town`, `townKnown`, `tract` and `county`, so the client-side point-in-polygon
  step becomes a fallback only. The JSONP call is prototype only.

### 5.1 Hosting: one repo, one Vercel project

Today there are two deployments: the team's Next app, deployed to Vercel as
**`switchpoint-psi.vercel.app`** (F-01 build log), and this prototype
(`switchpoint-map`, on Alexander's personal Vercel, deployed from the CLI). GitHub
shows no deployment events for `Elmata2/babson-hack`, so `switchpoint-psi` is most
likely deployed from the CLI too. Merge them:

1. **Whoever owns `switchpoint-psi` connects it to the GitHub repo** (Vercel → Project →
   Settings → Git). Only a repo admin (Elmata2) can install the Vercel GitHub app
   on the repo. After that, every push to `master` deploys production and every PR
   gets a preview. Invite the other builders to that Vercel team.
2. **The map lives in the app as `/map`** (`app/map/page.tsx`, F-41…). It uses the
   app's `/api/geocode`, `public/data/ma-towns.json`, the tract artefacts and
   `lib/utility`, not its own copies. It ships with every app deploy.
3. **Retire `switchpoint-map`** once `switchpoint-psi.vercel.app/map` serves the map.
   The `mvp/` folder stays only until `/map` reaches parity, then it's deleted.

Don't add a root `vercel.json` with `outputDirectory`, or a root `api/` folder:
both would override the Next.js build.

Privacy note for the team: `GET ?q=` with `s-maxage` puts the street address in the
URL, the CDN cache key and request logs, which data-sources.md says to avoid.
Consider `POST` with `cache-control: no-store`.
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
| 6 | One Vercel project | repo connected; `master` deploys; map reachable on the team URL (§5.1) |
| 7 | Street / Energy views | address search whooshes into OSM street view; toggle returns to 3D energy (§3.5) |
| 8 | ZIP search | ZCTA table baked; a ZIP lands in the right town; a split ZIP shows the pick-your-town prompt |
| 9 | Port into Next `/map` | shares geocode route, towns data and calc types |
| 10 | Replace mock demand | Done in F-75: Mass Save town totals, MassCEC solar, ISO-NE zonal load |

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
