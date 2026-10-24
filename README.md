# Switchpoint

**The honest heat pump verdict for Massachusetts.**

Hackachusetts 2026 · Babson hub (Weissman Foundry) · **Climate Tech, challenge C2 —
Cleaner, more affordable buildings** · built with Kiro.

---

## The one sentence

One in four Massachusetts homes heats with oil — 624,510 households at last
count. Oil costs **$6.23/gal**, up **75%** in a year. The whole-home heat pump
rebate drops by up to **$1,000** on January 1. Point the app at your address and your bill, and it tells you —
honestly — whether to switch, whether to do it before December 31, or whether to
leave it alone.

## What it does

Covers **every one of Massachusetts' 351 municipalities** — no demo borough, no
allow-list.

1. **Address → parcel.** MassGIS assessor records fill in year built and use code.
   No typing, no guesswork.
2. **Bill → fields.** Photo of an oil delivery receipt or a utility bill becomes
   typed, editable, confidence-scored numbers. The image is discarded after
   parsing.
3. **Verdict.** One of three answers, with the math expandable under every
   figure, and the source date on every price.
4. **Map.** Tract-level heat exposure across the region, with a 2026 ↔ 2027
   scrubber that shows exactly what the step-down costs each neighbourhood.
5. **Decide → consent → call → compare.** The household picks what to do next —
   nothing preselected. If they choose to shop, they read every fact an agent may
   say about them, confirm, and an ElevenLabs voice agent calls dealers or
   installers over a Twilio line and brings back one comparable number per row.
   Code ranks; the model only extracts. The call flow is configuration in
   [`agents/`](agents/) and is off unless the deployment configures it — the switch
   kit, with the exact question and the number, always works.

The demo video is being re-recorded from the live app in `?demo=1` mode, so the
new cut cannot show a screen the product does not have. Drop it at
`public/demo/switchpoint-demo.mp4` and `npm run submission` turns green.

If a gas-heated home will lose money on a heat pump, the screen says
**DON'T SWITCH YET** and prints the break-even electricity price. That is the
product, not an edge case.

## Run it

```bash
npm install
cp .env.example .env.local     # optional: EIA_API_KEY, BABSON_GATEWAY_KEY, ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
npm run build                  # production build, the same one Vercel runs
npm run check                  # tsc + eslint + vitest — the gate before every commit
```

Deployed on Vercel: **https://switchpoint-psi.vercel.app** — Next.js 16 (App
Router, Turbopack), Tailwind v4 tokens, Geist self-hosted through the `geist`
package so no font request leaves the page.

No keys? It still works: fuel prices fall back to a dated DOER snapshot, and
manual entry replaces bill OCR. `?demo=1` removes the network entirely: prices
come from the baked 2026-10-19 snapshot, the plain-English panel returns the
verdict's own sentences, and `/api/switch` returns baked statuses without
sending. There is no baked geocoder, address search, parcel record or bill
reader, so those routes answer with a typed `demo_unavailable` refusal and the UI falls back to
the manual path it already has — town from the list, year built typed, two
numbers instead of a photo. The verdict is identical because the engine never
changes; only the source of the prices does. Links carry the flag, so one
`?demo=1` click stays offline for the rest of the flow.

## The build log

`BUILDLOG.md` is generated from `@built F-NN` markers in the source. It is the
honest answer to "what did you actually get done today".

```bash
npm run log      # scan markers, regenerate BUILDLOG.md
npm run status   # progress per phase
npm run watch:log
```

## How Kiro was used

<!-- @built F-51 the README and the Kiro write-up: spec, steering, hooks, PBT, and the one number rule -->
<!-- @built F-59 challenge C2 quoted, and every organiser dataset named with its endpoint -->
<!-- @built F-158 seven v1 hooks: build log, property guard, rules regression, kiro guard, quality gate, drift, status -->
<!-- @built F-159 steering in all four inclusion modes with file references to the rule JSON -->
<!-- @built F-160 specs split by feature: onboarding-switch and voice-quotes beside the engine spec -->
<!-- @built F-161 an authored Kiro Power wrapping the MCP server and two steering guides -->
<!-- @built F-162 the Kiro write-up, the accessibility note and the judge sections of the README -->
<!-- @built F-163 submission check rows for Kiro depth and a public hosted demo video link -->

The full write-up, with a file to open for every claim, is **[`docs/KIRO.md`](docs/KIRO.md)**.

| Kiro capability | What we did | Where |
| --- | --- | --- |
| Specs | Three feature specs (engine, onboarding and switch, voice quotes): EARS requirements, correctness properties, F-numbered tasks | `.kiro/specs/` |
| Steering | Ten files in all four inclusion modes; program rules as a hard constraint, machine-readable rules pulled in by file reference | `.kiro/steering/` |
| Hooks | Seven v1 hooks: build log on save, property suite on engine edits, rules regression, a guard that blocks gitignoring `/.kiro`, a quality gate and a drift check after each task, build status at session start | `.kiro/hooks/` |
| MCP | A read-only server exposing the real engine, the sponsor gate and the rule tables as four tools | `mcp/` |
| Property-based testing | 22 named properties, plus a mutation check that plants ten bugs and shows which test style catches each | `lib/**/__tests__/*properties*`, `scripts/pbt-mutation-check.mjs` |
| Powers | One authored power wrapping the MCP server and two steering guides | `power/switchpoint-ma-heat-pump/` |

The short version: **the policy document is steering, so the model cannot invent
a rebate number; and the arithmetic is property-tested, so a plausible-looking
wrong answer cannot survive.** The model reads documents and writes sentences. It
never produces a number that reaches the screen.

To register the MCP server in Kiro, copy the `switchpoint` entry from
[`mcp/kiro-mcp.json`](mcp/kiro-mcp.json) into `.kiro/settings/mcp.json`, then ask Kiro
whether Wellesley gets Mass Save rebates.

## Why not Zillow

Zillow, Redfin and Realtor.com have no open API for this, and scraping them
breaks their terms. We use MassGIS Level 3 assessor parcels and Census ACS
instead — public records, statewide, and they carry the field we actually need
(`YEAR_BUILT`). See ADR-001 in `.kiro/steering/data-sources.md`.

## Numbers, with dates

Every figure is sourced and dated in
`.kiro/steering/mass-save-rules.md`. Headlines: oil **$6.23/gal** (MA DOER,
week of 2026-10-19); electricity **30.5¢/kWh** (EIA, Jul–Aug 2026); whole-home
rebate **$2,650/ton cap $8,500** in 2026 → **$2,350/ton cap $7,500** in 2027;
average install **$22,000** (Mass Save program data); federal 25C **expired**
2025-12-31.

**Estimate only. Not a quote. A Home Energy Assessment determines eligibility and
sizing.**

## Is the submission what we say it is?

`node scripts/submission/check.mjs` asks the repository, not a markdown file: repo
public, `.kiro` committed and not gitignored, specs and steering present, README
quoting C2, the build log at every row and not drifted, the video under three
minutes, the three workflows wired. `--review` adds the final read — commits,
`origin/master` sync, a dirty tree, the last twelve commits. The one row it cannot
check is the track chosen on the portal, and it prints that as MANUAL rather than
pretending.

## The check nobody else makes

Mass Save rebates come from the utility sponsor serving the address, and
municipal light plant customers get **none of it**. We resolve the sponsor from
MassGIS *Electricity Providers* before showing a dollar figure. Type a Wellesley
or Belmont address and the rebate line is replaced with the truth.

## Datasets

From the organizers' [campus data portal](https://hackachusetts2026.vercel.app/),
Climate track:

| Dataset | We use it for |
| --- | --- |
| [Electric utility by town](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/ElectricityProviders/MapServer/0) | sponsor lookup, municipal-light-plant gate, seasonal rate rule |
| [MassGIS environmental justice block groups](https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/EJ2020/MapServer/0) | equity overlay, limited-English share → plain-language path |
| [Boston BERDO 2021](https://data.boston.gov/dataset/building-energy-reporting-and-disclosure-ordinance) | context in the pitch only — it covers buildings >20k sqft, not our user |
| [Mass Save data](https://www.masssavedata.com/) | sanity-checking our rebate assumptions |

Elsewhere: MassGIS Level 3 parcels (year built, use code), Census ACS B25040
(oil-heat share by tract), Census Geocoder, EIA API v2 (live fuel and electricity
prices), MA DOER weekly fuel survey (the headline number).

## Challenge alignment

Hackachusetts Climate track, challenge **C2 — Cleaner, more affordable
buildings**. The brief's own words: *"older building stock, up-front retrofit
costs, and uneven access to efficiency programs… residents face affordability
pressures."* This is the tool for the household at the end of that sentence.

---

## Who benefits, and how it scales

- **Who:** the 624,510 Massachusetts households that heat with oil, who pay $6.23 a gallon
  this week; gas-heated households who deserve an honest "not yet"; and the residents of
  municipal light plant towns who are told, correctly, that Mass Save rebates do not apply to
  them. The enhanced offer (up to $16,000, or no cost through Turnkey) is surfaced for
  income-eligible households. See [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).
- **Why it is not saturated:** a rebate calculator quotes a number. This one checks that the household
  can receive it, refuses when it cannot, and says "do not switch yet" when the arithmetic says so.
- **How it scales:** all 351 towns work today from committed bakes and live point queries, with
  no database to run. A new program year is a change to `data/rules/*.json` and one steering
  file, guarded by the anchor and property tests. Another state needs its own sponsor layer, rule
  tables and fuel survey. The structure carries over (rules as data, a deterministic core, the
  consent gate, the ranking); the constants and tables do not.
- **Beyond tonight:** server accounts and notifications (a Basic Service reset, a contract end, a
  deadline) are specified in `.kiro/specs/onboarding-switch/` and marked not built.

## For judges: try it

- Live: **https://switchpoint-psi.vercel.app** (no login, free). Add `?demo=1` for the fully offline path.
- Locally: `npm install && npm run dev`, then `npm run check` for typecheck, lint and tests.
- Ask the engine directly: `npx tsx mcp/switchpoint-server.ts` speaks MCP over stdio.
- Reproduce the property-testing claim: `node scripts/pbt-mutation-check.mjs`.
- Check the submission against the rules: `npm run submission`.

## Submission

Track: **Climate Tech, challenge C2**. Checklist and scoring map:
[`.kiro/steering/submission-checklist.md`](.kiro/steering/submission-checklist.md).

Demo video (public, under three minutes): add the YouTube or Vimeo link here before submitting.
