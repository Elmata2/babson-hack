# Steering — Data sources and providers

**Inclusion:** always

Rule: **every live provider has a baked fallback and a visible freshness badge.**
No spinner between us and a demo that works.

## Provider table

| Provider | Used for | Transport | Key | Cache TTL | Fallback |
| --- | --- | --- | --- | --- | --- |
| **MA DOER fuel survey** | headline oil/propane prices | snapshot JSON, refreshed by hand or script | none | 7d | `data/snapshots/fuel-2026-10-19.json` |
| **EIA API v2** | machine-readable oil/propane + state electricity price | `GET https://api.eia.gov/v2/...` | `EIA_API_KEY` | 24h | DOER snapshot |
| **Census Geocoder** | address → lon/lat, tract GEOID, county | `GET geocoding.geo.census.gov/geocoder/locations/onelineaddress` | none | 30d | manual coordinate entry |
| **MassGIS L3 parcels** | assessor attrs: `YEAR_BUILT`, `USE_CODE`, `TOTAL_VAL`, `SITE_ADDR` | ArcGIS FeatureServer query | none | 30d | baked `data/parcels/{town}.json` |
| **ACS 5-yr B25040** | oil-heat share by census tract (choropleth) | baked from Census API | `CENSUS_API_KEY` (optional) | build-time | bundled static GeoJSON |
| **Anthropic API** | bill OCR + verdict prose | server route only | `ANTHROPIC_API_KEY` | none | manual entry form |

EIA series of interest (v2 uses `series` ids of the form
`PET.<SERIES>.W`; keep them in `data/sources/eia-series.json` so a wrong id is a
one-line fix, not a refactor):

- MA weekly No. 2 heating oil, residential — `W_EPD2F_PRS_SMA_DPG`
- MA weekly propane, residential — `W_EPLLPZ_PRS_SMA_DPG`
- MA residential electricity, monthly — from `electricity/retail-sales`

Verify each series id against `api.eia.gov` once with a browser before wiring it.
If a series 404s, the adapter logs and falls back; it never throws into the UI.

## ADR-001 — Zillow is rejected

**Decision:** do not use Zillow, Redfin, or Realtor.com in any form.

**Why:** none of them publish an open API for this use. Scraping violates their
terms of service, breaks silently, and is indefensible in front of judges from
AWS and a state coalition. It also gives us less than MassGIS does: assessor
records are first-party, statewide, and include the field we actually need
(`YEAR_BUILT`).

**Replacement:** MassGIS Level 3 assessor parcels (ArcGIS FeatureServer,
statewide, `YEAR_BUILT` / `USE_CODE` / `TOTAL_VAL`) + ACS tract tables. Both are
public records, both are citable, both survive a judge asking "where does that
number come from".

## ADR-002 — DOER is the headline, EIA is the machine read

**Decision:** the number a human reads on screen comes from the DOER weekly
telephone survey. The number a program reads comes from EIA.

**Why:** DOER's survey is what Massachusetts residents actually pay at the
nozzle, and it is the series that shows the +75% shock. EIA is what an API can
hand us reliably. When both are present and differ by more than 12%, show the
DOER figure and log the divergence.

## ADR-003 — No database

**Decision:** no Postgres, no user table, no session.

**Why:** there is no account and nothing to persist. Verdicts are computed on
the client from injected inputs; the server exists only to hide keys. This
removes the entire privacy surface (and every "where is my data stored" question)
in one decision.

## Privacy rules for providers

- Bill images are read into memory in the server route, parsed, and dropped. No
  disk, no blob store, no log line containing the image or the address.
- Never send a street address to the LLM. Send the parsed fuel fields only.
- Census geocoding is the only outbound call that contains an address, and it is
  a public government endpoint with no account.
- No third-party analytics, no session replay, no font-loading pixel.

## Failure behaviour

| Failure | User sees | App does |
| --- | --- | --- |
| EIA down / no key | `prices: snapshot 2026-10-19` badge | computes from snapshot |
| Geocoder down | address fields stay manual | computes without parcel prefill |
| OCR low confidence | amber field chips to confirm | blocks verdict until confirmed |
| Map tiles blocked | static tract PNG + table view | map interactions degraded, verdict intact |
| Judging wifi dead | nothing | `?demo=1` reads baked JSON only |
