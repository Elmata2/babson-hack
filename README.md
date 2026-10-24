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

The 1:37 demo cut is at
[`public/demo/switchpoint-demo.mp4`](public/demo/switchpoint-demo.mp4); it is made
from the live app in `?demo=1` mode by `scripts/demo/record.mjs`, so it cannot show
a screen the product does not have.

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

| Artefact | Where |
| --- | --- |
| Spec (requirements → design → tasks) | `.kiro/specs/switchpoint/` |
| Steering — the program rules as a hard constraint | `.kiro/steering/mass-save-rules.md` |
| Steering — units, constants, conventions | `.kiro/steering/units-and-conventions.md` |
| Steering — data providers, ADRs, failure behaviour | `.kiro/steering/data-sources.md` |
| Hooks — build log, PBT guard, spec drift | `.kiro/hooks/` |
| Property-based tests for the calc engine | `lib/calc/__tests__/properties.test.ts` |

The short version: **the policy document is steering, so the model cannot invent
a rebate number; and the arithmetic is property-tested, so a plausible-looking
wrong answer cannot survive.** The model reads documents and writes sentences. It
never produces a number that reaches the screen.

### What the hooks actually changed

`buildlog-sync` runs `node scripts/buildlog.mjs hook` on every source edit, so
`BUILDLOG.md` and `.buildlog/events.jsonl` were updated in the same save as the
`@built F-NN` marker. The log was never reconstructed at the end from memory.

`pbt-guard` fires on `lib/calc/**` and asks for the property suite before the
edit is accepted. That is why a change to the engine had to change the tests in
the same pass: the suite (`lib/calc/__tests__/properties.test.ts`) is the thing
that refuses a plausible-looking wrong number.

**Honest caveat.** Kiro's hook file schema has moved between releases
(`when.type` / `then.type`, pattern globs). `.kiro/hooks/README.md` says so, and
the hook body is always the same command you can run by hand — `npm run log`,
`npm run status`. We do not claim a hook fired on an install where it did not.
The build log reads the same markers either way.

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

## Event details

Mass AI Coalition × Kiro · Sat Oct 24, 2026 · 8 AM–8 PM ·
[info](https://massaicoalition.com/hackachusetts/)

| Time | What |
| --- | --- |
| 8:00 | Doors, breakfast, team formation |
| 11:30 | Hacking begins (challenges drop 9:00) |
| 20:00 | Hands off keyboards, submissions lock |
| 20:00–23:00 | Judging · finalists notified midnight |
| Sun 12:00 | Finalist brunch, winners announced |

**Submission checklist:** public GitHub repo · `/.kiro` committed (not
gitignored) · demo video < 3 min on YouTube/Vimeo · track selected · Kiro
write-up.

## House rules

- Leave the room as you found it — tables, chairs, whiteboards reset, trash in bins.
- No tailgating: don't hold doors for strangers. Report anyone suspicious.
- Stay in the designated hack spaces; ask if unsure.
- Respect others studying or working in the building.
- Full terms: https://tinyurl.com/sundaiterms

## Comms

Discord is mandatory — phone app *and* desktop. How-to (4 min):
https://youtu.be/qVl4QdROUIA ·
[Mass AI Coalition](https://massaicoalition.com/) ·
[Sundai Club](https://www.sundai.foundation/about)
