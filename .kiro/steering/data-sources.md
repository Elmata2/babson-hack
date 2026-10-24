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
| **MassGIS L3 parcels** | `YEAR_BUILT`, `USE_CODE`, `SITE_ADDR` | ArcGIS FeatureServer, **layer 1**, point query, live | none | 30d | manual entry |
| **TIGERweb tracts** | statewide tract geometry (~1,620) | ArcGIS `Tracts_Blocks/MapServer/0` | none | build-time | committed TopoJSON |
| **Census Reporter** | ACS B25040 oil-heat share by tract | `api.censusreporter.org` (keyless) | none | build-time | committed JSON |
| **Open-Meteo archive** | county HDD65 from ERA5 | `archive-api.open-meteo.com` | none | build-time | committed JSON |
| **MassGIS EJ2020** | equity overlay by block group | ArcGIS FeatureServer | none | build-time | baked into tract GeoJSON |
| **ACS 5-yr B25040** | oil-heat share by tract | baked from Census API | optional | build-time | bundled static GeoJSON |
| **Babson LiteLLM gateway** | bill OCR (`claude-sonnet-5`) | server route only | `BABSON_GATEWAY_KEY` | none | manual entry form |
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

**Cape Light Compact is missing from the dataset (F-63).** CLC's 21 member towns
in Barnstable and Dukes counties are published as *Eversource distribution*. CLC
is a Mass Save Electric Sponsor (it appears in masssave.com's own sponsor list),
so those towns are rewritten to `cape_light` at bake time, inferred from the
county table rather than a typed list, and marked `inferred: true`. CLC is
eligible for Mass Save rebates, but **no seasonal-rate adjustment is published for
it** — that stays `null` and the UI says "verify", rather than inventing −$0.07.

This is the same failure mode as Wellesley, in reverse: one town would have been
quoted a rebate it cannot get, 21 towns would have been denied one they can, and
both errors are invisible unless you check the sponsor layer first.

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

## Statewide build — all 351 towns, not one neighbourhood

**Requirement: every Massachusetts address, not a demo borough.** That changes
what can be baked and what must be live. Verified 2026-10-24 against live
endpoints:

| Layer | Volume | Strategy | Verified |
| --- | --- | --- | --- |
| Electric utility by town | 351 rows | **bake once, commit** (~25 KB) | `count: 351` |
| Census tracts (geometry) | ~1,620 | **bake, simplify, commit** (target < 2.5 MB raw) | `TIGERweb/Tracts_Blocks/MapServer/0` |
| Tract statistics (ACS B25040) | ~1,620 | **bake, strip to 5 fields, commit** (~120 KB) | Census Reporter 800 KB raw → strip |
| County HDD65 | 14 | **bake, commit** (~2 KB) | Open-Meteo ERA5 |
| Parcels | **2.5M** | **never bake — live point query**, 4s abort | `L3_Parcels_FeatureService_4326`, **layer 1** |
| Town boundaries | 351 | bake, commit (drill-down level) | `AGOL/Census2020_Towns` |
| EJ block groups | ~5,000 | bake at block-group level, join to tract | `AGOL/EJ2020` |

### The three traps, each found the hard way

1. **The Census API now requires a key.** `api.census.gov` returns `302` →
   `missing_key.html` with header `X-DataWebAPI-KeyError: 1`. Do not build the
   map on it. **Census Reporter** (`api.censusreporter.org/1.0/data/show/latest?
   table_ids=B25040&geo_ids=140|04000US25`) returns all Massachusetts tracts,
   keyless, in one 800 KB response. Bake from that; the committed JSON is what
   ships, so no runtime key is needed at all.
2. **Parcels are a live lookup, not a dataset.** 2.5M parcels cannot be baked or
   shipped. Use `…/L3_Parcels_FeatureService_4326/MapServer/1` with an
   `esriGeometryPoint` intersect on the geocoded coordinate, `returnGeometry=false`,
   and only the five fields we need. **Layer 0 is Devens only** — a plausible-looking
   mistake that returns zero features for the entire rest of the state.
3. **HDD must be computed, not guessed.** `ERR` the county table only if
   Open-Meteo is down. Compute from daily means, per county centroid:
   `HDD65 = Σ max(65 − T̄d, 0)`, averaged over 2015–2024. Sanity anchor verified:
   Middlesex 2024 = **5,599**, against the 5,600 Boston constant. Label the result
   *county-centroid degree days* and keep the Manual J caveat.

### Runtime budget, statewide

| Asset | Budget | Note |
| --- | --- | --- |
| `ma-tracts.topo.json` | ≤ 2.5 MB raw, ≤ 700 KB brotli | simplified at bake, quantized |
| `ma-tract-stats.json` | ≤ 150 KB | loaded before geometry |
| `utilities.json` | ≤ 30 KB | needed on the verdict path, so keep it tiny |
| `hdd-by-county.json` | ≤ 3 KB | |
| Map first paint | ≤ 2.0s | state-level paint from stats; geometry lazy |

Never block intake or verdict on a map asset. The map is a second route with a
dynamic import; the verdict works with the map chunk never loading.

---

## ADR-009 — Statewide or nothing

**Decision:** no town allow-list. Any of the 351 municipalities resolves, or the
app says why it cannot.

**Why:** a five-town demo invites "does it work in Springfield?" and the honest
answer would be no. The data is statewide and free; the only cost is baking
discipline. Correctness scales better than the demo does.

**Consequence:** every layer has a documented degradation path, and the parcel
step is allowed to fail without failing the verdict.

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
