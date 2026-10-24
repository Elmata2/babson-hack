# Switchpoint

**The honest heat pump verdict for Massachusetts.**

Hackachusetts 2026 · Babson hub (Weissman Foundry) · **Climate Tech, challenge C2 —
Cleaner, more affordable buildings** · built with Kiro.

---

## The one sentence

Three in ten Massachusetts homes heat with oil. Oil costs **$6.23/gal**, up
**75%** in a year. The whole-home heat pump rebate drops by up to **$1,000** on
January 1. Point the app at your address and your bill, and it tells you —
honestly — whether to switch, whether to do it before December 31, or whether to
leave it alone.

## What it does

1. **Address → parcel.** MassGIS assessor records fill in year built and use code.
   No typing, no guesswork.
2. **Bill → fields.** Photo of an oil delivery receipt or a utility bill becomes
   typed, editable, confidence-scored numbers. The image is discarded after
   parsing.
3. **Verdict.** One of three answers, with the math expandable under every
   figure, and the source date on every price.
4. **Map.** Tract-level heat exposure across the region, with a 2026 ↔ 2027
   scrubber that shows exactly what the step-down costs each neighbourhood.

If a gas-heated home will lose money on a heat pump, the screen says
**DON'T SWITCH YET** and prints the break-even electricity price. That is the
product, not an edge case.

## Run it

```bash
npm install
cp .env.example .env.local     # optional: EIA_API_KEY, ANTHROPIC_API_KEY
npm run dev
```

No keys? It still works: fuel prices fall back to a dated DOER snapshot, and
manual entry replaces bill OCR. `?demo=1` disables all network calls and uses
baked data only.

## The build log

`BUILDLOG.md` is generated from `@built F-NN` markers in the source. It is the
honest answer to "what did you actually get done today".

```bash
npm run log      # scan markers, regenerate BUILDLOG.md
npm run status   # progress per phase
npm run watch:log
```

## How Kiro was used

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

## Why not Zillow

Zillow, Redfin and Realtor.com have no open API for this, and scraping them
breaks their terms. We use MassGIS Level 3 assessor parcels and Census ACS
instead — public records, statewide, and they carry the field we actually need
(`YEAR_BUILT`). See ADR-001 in `.kiro/steering/data-sources.md`.

## Numbers, with dates

Every figure is sourced and dated in
`.kiro/steering/mass-save-rules.md`. Headlines: oil **$6.23/gal** (MA DOER,
week of 2026-10-19); electricity **30.5¢/kWh** (EIA, Jul 2026); whole-home
rebate **$2,650/ton cap $8,500** in 2026 → **$2,350/ton cap $7,500** in 2027;
average install **$22,000** (Mass Save program data); federal 25C **expired**
2025-12-31.

**Estimate only. Not a quote. A Home Energy Assessment determines eligibility and
sizing.**

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
