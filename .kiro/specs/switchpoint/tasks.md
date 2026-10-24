# Tasks — Switchpoint

**Window:** 11:30 → 20:00 ET (8.5h hacking). Submission locks 20:00 sharp.
**Legend:** every row is a feature the build log counts. `F-NN` is the marker id
used in code.

> **ID allocation — read this before adding a row.** Two agents are building in
> this repo at once and both took F-64/F-65 within ten minutes of each other.
> Blocks: **F-01–F-63** original spec · **F-64–F-75** app/ and components/ ·
> **F-76–F-99** lib/, data/, parse/ · **F-100–F-119** one-photo intake fix
> (`fix/one-photo-intake`) · **F-120–F-139** Addendum A (agent + CI). Take the next free number *inside your block*,
> and add your row in the same commit as your marker.

Owner slots: **A** = UI/frontend · **B** = calc/data · **C** = OCR/map/integration
· **D** = pitch, video, submission. Solo: work top to bottom, skip every row
marked ✂ until P4 is green.

---

## P0 — Foundation

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-01 | P0 | Next.js 16 + TypeScript + Tailwind v4 scaffold, deploys to Vercel | A | 15m | — |
| F-02 | P0 | App shell: type scale, colour tokens, verdict palette | A | 20m | F-01 |
| F-03 | P0 | Build log tooling + Kiro hook wiring | D | 20m | F-01 |
| F-04 | P0 | Commit `.kiro` specs + steering, confirm not gitignored | D | 10m | F-01 |
| F-05 | P0 | `npm run check` = tsc + eslint + vitest, run before every commit | B | 10m | F-01 |

## P1 — Data spine

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-06 | P1 | `lib/calc/constants.ts` — every physical constant, unit in the name | B | 15m | F-01 |
| F-07 | P1 | `data/rules/heat-pump-2026.json` + `-2027.json`, typed loader | B | 25m | F-06 |
| F-08 | P1 | `data/snapshots/fuel-2026-10-19.json` from the DOER survey | B | 10m | — |
| F-09 | P1 | `/api/prices` — EIA v2 adapter using the **verified** series ids in `data-sources.md`; per-series typed parse (`value` vs `price`), 24h cache, snapshot fallback | C | 35m | F-08 |
| F-10 | P1 | `/api/geocode` — Census onelineaddress → lat/lon/tract | C | 25m | — |
| F-11 | P1 | `/api/parcel` — MassGIS L3 point query → YEAR_BUILT, USE_CODE | C | 35m | F-10 |
| F-12 | P1 | `scripts/bake-hdd.mjs` — Open-Meteo ERA5, 14 county centroids → `hdd-by-county.json` (verify Middlesex 2024 ≈ 5,599) | C | 25m | — |
| F-13 | P1 | `scripts/bake-map.mjs` — statewide: TIGERweb tracts + towns, Census Reporter B25040, EJ2020 → committed artefacts at the sizes in design §3 | C | 60m | — |
| F-60 | P1 | `scripts/bake-utilities.mjs` — 351 towns, parse comma-joined `ELEC_LABEL` → `{sponsors[], hasMunicipal, mixed}` | C | 25m | — |
| F-61 | P1 | State geometry trim: simplify + quantize `ma-tracts.topo.json` under 2.5 MB, verify gzip < 700 KB | C | 30m | F-13 |
| F-62 | P1 | `lib/geo.ts` — town → county → tract lookup, statewide, no allow-list | B | 25m | F-13 |
| F-14 | P1 | Freshness badge component (`live` / `snapshot 10/19` / `assessor`) | A | 15m | F-02 |

## P2 — Calculation core (the part that must be right)

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-15 | P2 | `deliveredHeat()` — units × BTU × AFUE, bill vs envelope source | B | 20m | F-06 |
| F-16 | P2 | `designLoad()` — UA from HDD65, design BTU/hr | B | 20m | F-15 |
| F-17 | P2 | `sizeTons()` — round to 0.5, warn above 5 ton | B | 10m | F-16 |
| F-18 | P2 | `rebate()` — tier × tonnage × year, bonuses, caps | B | 35m | F-07 |
| F-19 | P2 | `annualKWh()` + `operatingCost()` — SCOP, standard vs seasonal | B | 20m | F-15 |
| F-20 | P2 | `payback()` + `heatLoan()` — 84mo at 0% | B | 15m | F-19 |
| F-21 | P2 | `breakEvenElectricPrice()` — the honesty number | B | 15m | F-19 |
| F-22 | P2 | `verdictOf()` — four ordered rules, total function | B | 20m | F-18 |
| F-23 | P2 | `computeVerdict()` — assembles result, collects assumptions | B | 30m | F-22 |
| F-24 | P2 | Property suite P1–P12 with fast-check | B | 50m | F-23 |
| F-25 | P2 | Golden anchor test: 800 gal @ $6.23 → $2,723 savings, 4.96 yr | B | 15m | F-23 |

## P3 — Ingestion

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-26 | P3 | `/api/parse-bill` — vision call, in-memory only, no storage | C | 40m | F-01 |
| F-27 | P3 | OCR prompt + JSON schema + `not_a_bill` guard | C | 20m | F-26 |
| F-28 | P3 | `lib/parse/plausibility.ts` — range checks, flags, confidence gate | B | 30m | F-27 |
| F-64 | P3 | Address type-ahead over OpenStreetMap (Nominatim, bounded to MA) — "106 Chandler" finds every match in the state | A | 60m | F-10 |
| F-65 | P3 | Bill upload side panel — the photo path with no dead end, fills the numbers only on request | A | 45m | F-26 |
| F-76 | P3 | `lib/parse/annualise.ts` — five named methods (printed history, degree days, tank cadence, HDD-scaled, ×12) + a summer refusal; `hdd-monthly-weights.json` from the ERA5 bake | B | 60m | F-28 |
| F-77 | P3 | Route plumbing: forward `deliveriesPerSeason` / `heating` / `forceMonthlyX12` / `countyFips`; 9 route tests with the vision call mocked | C | 30m | F-76 |
| F-79 | P3 | Two readers: Anthropic console key or OpenRouter (`google/gemma-3-12b-it`, ~$0.00003/bill); OAuth tokens refused by name; all-in price rule in the prompt | B | 45m | F-77 |
| F-80 | P3 | `scripts/demo-bills/render.mjs` — sample bills (oil tickets, Eversource-layout electric and gas, not-a-bill, phone photo) rendered from the parse fixtures to `public/demo-bills/` | C | 45m | F-77 |
| F-81 | P3 | `scripts/demo-bills/eval.mjs` — post every sample bill to `/api/parse-bill`, diff against expected | C | 20m | F-80 |
| F-29 | P3 | Bill confirm UI — editable chips, confidence colours | A | 45m | F-28 |
| F-30 | P3 | Manual entry — fuel select + two numbers, same speed as OCR | A | 25m | F-02 |
| F-31 | P3 | Address intake, merge bill + assessor + manual with per-field source | A | 40m | F-11 |
| F-64 | P3 | Address autocomplete: Nominatim (OpenStreetMap) forward search, Massachusetts-bounded, keyboard listbox, click → town + parcel prefill | A | 45m | F-31 |
| F-65 | P3 | Bill upload side panel: photo → `/api/parse-bill` → editable fields, no dead end when OCR is unconfigured | A | 30m | F-26 |

## P4 — Verdict (this is the product)

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-32 | P4 | Verdict screen shell — one number, big, unmissable | A | 30m | F-23 |
| F-33 | P4 | Number flip: old cost → new cost, 900ms, respects reduced-motion | A | 30m | F-32 |
| F-34 | P4 | Verdict dial — three states, icon + label + colour | A | 30m | F-32 |
| F-35 | P4 | Rebate stack panel — line items, tier chosen, why | A | 35m | F-18 |
| F-36 | P4 | Provenance drawer — formula, substituted values, source date | A | 40m | F-32 |
| F-37 | P4 | Cash-flow module — 0% loan vs monthly savings | A | 25m | F-20 |
| F-38 | P4 | Assumptions strip + disclaimer, always visible | A | 15m | F-23 |
| F-39 | P4 | `/api/explain` — three sentences of plain English, no numbers invented | C | 25m | F-23 |
| F-40 | P4 | Three demo presets: oil-enhanced, propane, gas-do-not-switch | D | 20m | F-32 |

## P5 — Map ✂ (cut these first if behind)

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-41 | P5 | Map shell — MapLibre + Positron basemap, no key | C | 30m | F-13 |
| F-42 | P5 | Tract choropleth layer, data-driven fill, colour-safe ramp | C | 35m | F-41 |
| F-43 | P5 | Metric switcher: oil share / oil spend / cliff dollars | C | 25m | F-42 |
| F-44 | P5 | Hover tooltip + click tract panel | C | 30m | F-42 |
| F-45 | P5 | 2026↔2027 scrubber with tweened aggregate loss | C | 35m | F-43 |
| F-46 | P5 | ✂ Parcel pins in one town + "use this tract" seed | C | 30m | F-44 |
| F-47 | P5 | ✂ Keyboard nav + accessible table view | A | 25m | F-44 |
| F-48 | P5 | ✂ Static PNG fallback + tile-failure path | C | 15m | F-42 |

## P6 — Ship

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-49 | P6 | `?demo=1` mode — no network, baked data, identical verdict | B | 20m | F-40 |
| F-50 | P6 | Polish pass — spacing, contrast, mobile 390px | A | 30m | F-38 |
| F-51 | P6 | README + Kiro write-up (spec, steering, hooks, PBT, MCP) | D | 30m | F-24 |
| F-52 | P6 | Demo video, < 3 min, uploaded and public | D | 40m | F-49 |
| F-53 | P6 | Submission checklist: repo public, `.kiro` present, track selected | D | 15m | F-51 |
| F-54 | P6 | Final `BUILDLOG.md` + `git log` review | D | 10m | F-53 |

## P7 — Organizer datasets (added 10:20, after reading the campus data portal)

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-55 | P7 | Verify utility coverage: all 351 towns present, spot-check 8 MLP towns + 3 `mixed` towns (Lakeville) against masssave.com sponsor list | C | 20m | F-60 |
| F-56 | P7 | `lib/utility.ts` — sponsor → seasonal rate rule, MLP eligibility gate, `mixed` → ask | B | 20m | F-55 |
| F-57 | P7 | Verdict screen utility badge + MLP refusal state (the Wellesley beat) | A | 20m | F-56 |
| F-58 | P7 | EJ2020 bake + `ej-overlay` map layer toggle, no effect on heat values | C | 30m | F-42 |
| F-63 | P7 | Cape Light Compact: infer the 21 member towns from Barnstable (25001) + Dukes (25007) county membership, rewrite `eversource` → `cape_light`, mark `inferred: true`, eligibility `true`, seasonal rule `null` | C | 25m | F-60 |
| F-59 | P7 | README: challenge C2 quote, dataset citations, utility-coverage note | D | 15m | F-56 |

**F-55/F-56/F-57 are not optional.** They are the difference between quoting a
rebate and quoting a rebate the household can actually receive. Wellesley and
Belmont — the two towns nearest this venue — are **municipal light plant** towns
and are not eligible for Mass Save electric rebates at all.

---

## Cut line

**Must be green by 17:30:** F-01 → F-40, F-49, **F-55, F-56, F-57** (the utility
gate is a correctness requirement, not a flourish).
**Everything in P5 is optional** and ordered by demo value: F-41, F-42, F-44,
F-45 (the scrubber is worth more than the pins), F-43, F-47, F-46, F-48.

If you are behind at 16:00, ship a **static tract PNG with the 2026/2027 toggle
as a two-state image swap**. It reads identically on video and costs 15 minutes
instead of 90.

## Definition of done, per feature

1. It works on a phone at 390px and on the projector at 1920px.
2. It fails visibly and gracefully when its network source is gone.
3. `@built F-NN …` marker is in the same commit.
4. `npm run check` passes.
5. `node scripts/buildlog.mjs status` shows the bar move.

## Hourly checkpoints

| Time | Gate |
| --- | --- |
| 12:00 | Deployed URL loads; `.kiro` committed; build log live |
| 13:30 | `computeVerdict()` returns correct numbers for all three presets |
| 15:00 | A bill photo → confirmed fields → verdict, end to end |
| 16:30 | Number flip + dial + provenance drawer all working |
| 17:30 | Map renders; scrubber moves; freeze announced |
| 18:30 | No new features. Only fixes, polish, and cuts |
| 19:30 | Video uploaded, repo pushed, submission started |
| 20:00 | Submitted on SundAI. Done. |

---

# Addendum A — tasks (proposal, pending review · 2026-10-24)

Not part of the 17:30 must-be-green line. P9 rows F-132…F-135 are cheap and can go
in any time after F-05. P8 starts only after P4 is green, and only if the team
agrees the agent beat is worth one 3-minute-video slot.

## P8 — Decide, call, compare

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-120 | P8 | `choicesFor()` + decision gate UI, four choices, nothing preselected | A | 30m | F-32 |
| F-121 | P8 | `lib/quotes` types, `effectivePerGal`, `plausible`, `rankFuel`, `rankInstallers` + P13–P16 | B | 45m | F-23 |
| F-122 | P8 | `data/providers/*.json` seed: team allowlist + MetroWest dealers and installers with source/date | C | 20m | — |
| F-123 | P8 | `agents/quote-caller/` prompts, first message, data-collection schema; create agent + Twilio number on ElevenLabs | C | 40m | F-121 |
| F-124 | P8 | `POST /api/calls` — closed facts schema, allowlist, business hours, outbound calls | C | 35m | F-123 |
| F-125 | P8 | `GET` + `DELETE /api/calls/[sessionId]` — poll conversations, parse to `ProviderQuote`, delete | C | 35m | F-124 |
| F-126 | P8 | Consent screen (R18) | A | 25m | F-120 |
| F-127 | P8 | Live call board + ranked table + transcript-excerpt drawer | A | 45m | F-125 |
| F-128 | P8 | "Use this price" → recompute verdict; switch kit | A | 20m | F-127 |
| F-129 | P8 | `?demo=1` replay: three fixture conversations with staged timing | B | 20m | F-127 |
| F-130 | P8 | ✂ Ask-for-a-better-price round (R21) | C | 30m | F-128 |
| F-131 | P8 | ✂ Inbound verdict line, `computeVerdict` server tool, 4 languages (R23) | C | 45m | F-123 |

## P9 — Continuous integration

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-132 | P9 | `.github/workflows/ci.yml`: check, build-log drift, `.kiro` guard | D | 20m | F-05 |
| F-133 | P9 | gitleaks secret scan job | D | 10m | F-132 |
| F-134 | P9 | Agent contract tests + hostile fixture transcripts, no network | B | 25m | F-121 |
| F-135 | P9 | ✂ ElevenLabs simulation tests on PRs touching `agents/**` | C | 30m | F-123 |
| F-136 | P9 | ✂ Push `agents/` config to ElevenLabs on merge to `master` | C | 20m | F-123 |

**Addendum cut line.** Minimum demoable slice: F-120, F-121, F-122, F-123, F-124,
F-125, F-127, F-129 (≈ 4h30 with one person on C). Without a second person free
after 15:00, ship the decision gate + switch kit (F-120, F-128 without calls) and
put the call flow on a slide.

---

# One-photo intake fix — tasks (2026-10-24)

Spec: `docs/fixes/2026-10-24-one-photo-intake.md`. Amends R1.4, R2, R4.

| ID | Phase | Task | Owner | Est | Depends |
| --- | --- | --- | --- | --- | --- |
| F-100 | P10 | `lib/parse/contract.ts`: `BillParseExtras`, `BillApplied`, `BillRole`, `BillUtility` | C | 10m | F-28 |
| F-101 | P10 | Prompt v3: utility, ZIP/town, service dates, totals, supplier, R-1…R-4, discount line, read type, budget billing, CCF + therm factor, history kind, multi-page | C | 30m | F-100 |
| F-102 | P10 | Validator: price = total ÷ quantity in code; `role`; gas heat/non-heat; low-income signal; CCF; season ≠ year; unknown-doc refusal | B | 45m | F-101 |
| F-103 | P10 | Annualise: service-day weighting, bars vs numbers confidence, baseload, county name, client-side `reannualiseWithFills` | B | 45m | F-102 |
| F-104 | P10 | Parcel guard on every match + residential use code + units; dedupe address suggestions | A | 30m | F-11 |
| F-105 | P10 | Bill-first `/start`; town only on lookup failure; plain-language tier and income questions | A | 45m | F-104 |
| F-106 | P10 | Verdict round-trip; method/confidence/note in provenance; bill electricity rate override | A | 35m | F-105 |
| F-107 | P10 | Client image prep: orientation, ≤2000px JPEG < 1.5 MB, PDF < 4 MB | C | 25m | — |
| F-108 | P10 | Route: up to 3 pages in one read; client sends `countyFips` and `heating` | C | 25m | F-107 |
| F-109 | P10 | Confirm card: found-chips, check? on low confidence, auto-apply + Undo, "+ Add your electric bill" | A | 45m | F-102, F-108 |
| F-110 | P10 | Render PDF pages to JPEG in browser so OpenRouter accepts PDF uploads; enforce 3-page total | A | 30m | F-107, F-108 |
