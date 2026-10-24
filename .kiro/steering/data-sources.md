# Steering — Data sources and providers

**Inclusion:** always

Rule: **every live provider has a baked fallback and a visible freshness badge.**
No spinner between us and a demo that works.

## Provider table

| Provider | Used for | Transport | Key | Cache TTL | Fallback |
| --- | --- | --- | --- | --- | --- |
| **EIA API v2** | machine-readable oil, propane, state electricity | `GET api.eia.gov/v2/seriesid/{id}` | `EIA_API_KEY` | 24h | DOER snapshot |
| **MA DOER fuel survey** | the number a human reads | snapshot JSON, refreshed by script | none | 7d | `data/snapshots/fuel-2026-10-19.json` |
| **Census Geocoder** | address → lon/lat, tract GEOID | `geocoding.geo.census.gov` | none | 30d | manual coordinate entry |
| **MassGIS L3 parcels** | `YEAR_BUILT`, `USE_CODE`, `SITE_ADDR` | ArcGIS FeatureServer | none | 30d | baked `data/parcels/{town}.json` |
| **MassGIS ElectricityProviders** | **town → electric utility, MLP detection** | ArcGIS FeatureServer | none | build-time | baked `data/utilities.json` |
| **MassGIS EJ2020** | equity overlay by block group | ArcGIS FeatureServer | none | build-time | baked into tract GeoJSON |
| **ACS 5-yr B25040** | oil-heat share by tract | baked from Census API | optional | build-time | bundled static GeoJSON |
| **Anthropic API** | bill OCR + verdict prose | server route only | `ANTHROPIC_API_KEY` | none | manual entry form |

---

## EIA — verified endpoints (checked 2026-10-24 with a live key)

Series ids, confirmed to return data. **My first guess was wrong; these are the
working ones.** Do not "tidy" them.

| What | Series id | Latest at check | Payload key |
| --- | --- | --- | --- |
| MA No. 2 heating oil, residential, weekly | `PET.W_EPD2F_PRS_SMA_DPG.W` | 2026-10-19 · **6.115** $/gal | `value` |
| MA propane, residential, weekly | `PET.W_EPLLPA_PRS_SMA_DPG.W` | 2026-10-19 · **3.659** $/gal | `value` |
| MA residential electricity, monthly | `ELEC.PRICE.MA-RES.M` | 2026-08 · **30.48** ¢/kWh | **`price`** |

**The trap:** the petroleum series put the number in `value`; the electricity
series puts it in `price` and adds `price-units: "cents per kilowatt-hour"`.
A single generic "read `value`" adapter silently returns `undefined` for
electricity and the UI shows `$NaN`. The adapter must be per-series typed.

Call shape:

```
GET https://api.eia.gov/v2/seriesid/{series_id}
    ?api_key=…&length=1
    &sort[0][column]=period&sort[0][direction]=desc
```

`ELEC.PRICE.MA-RES.M` is ~2 months lagged. Never render it as "today's rate";
render the period.

The DOER weekly survey (oil $6.23) and EIA (oil $6.115) differ by ~1.8% on the
same week — inside the 12% divergence rule. Show DOER, log EIA, keep both.

---

## Organizers' data portal — verified 2026-10-24

Hackachusetts ships a campus data portal (`hackachusetts2026.vercel.app`) with a
per-track dataset list. Four entries in the Climate track are directly load-bearing
for us, and three of them close gaps we had papered over:

| Dataset | Endpoint | What it actually gives us | Status |
| --- | --- | --- | --- |
| **Electric utility by town** | `arcgisserver.digital.mass.gov/…/AGOL/ElectricityProviders/MapServer/0` | `TOWN`, `ELEC`, `ELEC_LABEL` — which sponsor serves each town, and whether a municipal light plant is involved | **required** (see R3.6) |
| **MassGIS environmental justice block groups** | `…/AGOL/EJ2020/MapServer/0` | `MUNICIPALITY`, `PCT_MINORITY`, `LIMENGHHPCT` (limited-English households), `BG_MHHI` | **required** for the map |
| **Boston BERDO reporting, 2021** | `data.boston.gov` datastore `43e4abc9-…` | `Site_EUI_kBtuft2`, `GHG_Intensity_kgCO2sf`, `per_Gas`, `per_Electricity` | **context only** |
| **Renewables at Massachusetts landfills** | `…/DEP/RenewablesAtMaLandfills` | landfill solar capacity | not used |

### Why the utility dataset matters more than it looks

Mass Save rebates are paid by the *sponsor* serving the account, and **municipal
light plant customers are not eligible for Mass Save electric rebates at all**.
Before this dataset we could not tell a Wellesley address from a Holyoke one.
Now the app can refuse correctly instead of quoting $8,500 to someone who will
never receive it. The seasonal heat pump rate also depends on the sponsor
(`− $0.07` for Eversource/Unitil, `− $0.04` for National Grid).

**Known messiness:** `ELEC_LABEL` can be a comma-joined list — e.g.
`"Municipal, NSTAR Electric d/b/a Eversource Energy"` for towns partly served by
both. Treat it as `{ sponsors: string[], hasMunicipal: boolean, mixed: boolean }`
and, when `mixed`, ask the user which utility bills them. Never silently pick the
first string.

### Why BERDO is context, not a feature

BERDO covers Boston buildings over ~20,000 sqft. Our user is a single-family
house. First-page sampling also shows many null EUI values. Use it as one chart
in the pitch ("buildings are the sector, and it is measurable"), never as a
calculation input. Saying this out loud is worth more than pretending to use it.

### Why EJ2020 earns its place

It converts the equity claim from a slide into a data layer: `PCT_MINORITY` and
`LIMENGHHPCT` by block group, joinable to our tract polygons. It also justifies
the plain-language and translation work as a requirement rather than a nice-to-have.

---

## ADR-001 — Zillow is rejected

**Decision:** no Zillow, Redfin, or Realtor.com, in any form.

**Why:** none of them publish an open API for this use. Scraping violates their
terms, breaks silently, and is indefensible in front of judges from AWS and a
state coalition. It also gives us less than MassGIS: assessor records are
first-party, statewide, and carry the field we actually need (`YEAR_BUILT`).

**Replacement:** MassGIS L3 parcels + Census ACS + the organizers' utility layer.

## ADR-002 — DOER is the headline, EIA is the machine read

Show the DOER number a resident actually pays; use EIA for programmatic reads.
Divergence > 12% → show DOER, log the gap.

## ADR-003 — No database

No accounts, nothing to persist. Verdicts compute on the client; the server only
hides keys. This removes the entire privacy surface in one decision.

## ADR-008 — Prefer the organizers' datasets over our own

When the challenge portal publishes a dataset, use it, cite it, and say so in the
video. It is the cheapest possible alignment with the brief, and the judges built
the portal. We only go elsewhere when the portal's dataset is wrong for the job
(BERDO) or absent (fuel prices, parcels).

---

## Privacy rules for providers

- Bill images are read into memory in the server route, parsed, and dropped.
- Never send a street address to the LLM. Parsed fuel fields only.
- Census geocoding is the only outbound call containing an address, and it is a
  public government endpoint.
- No third-party analytics, no session replay, no font-loading pixel.

## Failure behaviour

| Failure | User sees | App does |
| --- | --- | --- |
| EIA down / no key | `prices: snapshot 2026-10-19` badge | computes from snapshot |
| Utility lookup misses the town | "which utility bills you?" | asks, never guesses |
| Geocoder down | manual address fields | computes without parcel prefill |
| OCR low confidence | amber confirm chips | blocks verdict until confirmed |
| Map tiles blocked | static PNG + table view | verdict intact |
| Judging wifi dead | nothing | `?demo=1` reads baked JSON only |
