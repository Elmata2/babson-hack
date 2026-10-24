# Changelog

Hand-kept and reviewed against the machine ledger. Every line names the feature
id the build log counts (`.kiro/specs/switchpoint/tasks.md`), so the two views
say the same thing: `BUILDLOG.md` is generated from `@built` markers, this file
explains *why* the change exists.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates are ET,
because that is when the hackathon clock runs.

---

## 2026-10-24

### Added

- **F-01** — Next.js 16.4.3 App Router, React 19.3, Tailwind v4, TypeScript
  6.0.3. Deploys to Vercel on every push to `master`
  (<https://switchpoint-psi.vercel.app>). Geist is self-hosted, so no font
  request leaves the page and a dead venue network changes nothing.
- **F-02** — the shell: warm paper/ink tokens, a three-tone verdict palette
  (`switch` / `deadline` / `hold`) selected by `data-tone`, and a warm
  sequential heat ramp that belongs to the map only. Type scale with tabular
  figures; verdict label, headline and tone live in `lib/verdicts.ts` next to
  the decision in `lib/calc/verdict.ts`.
- **F-05** — `npm run check` = `tsc --noEmit && eslint . && vitest run`. The
  gate is what makes every marker below worth anything.
- **F-14** — `FreshnessBadge` plus `lib/freshness.ts`. `live`, `snapshot 19 Oct`,
  `assessor` and `manual` are derived from what the adapter reported, never
  asserted by the screen. The landing page's fuel figure now reads the same
  adapter the verdict does, so the two cannot drift.
- **F-26** — `POST /api/parse-bill`: one vision call, in memory, `no-store`.
  Typed failures for no key, oversized file, unsupported type, upstream down,
  timeout, and not-a-bill. No log line contains the image, the response text or
  an address.
- **F-27** — the OCR prompt verbatim from design §2.4, a JSON contract, fence
  stripping, and the `{"error":"not_a_bill"}` guard. Broken JSON is refused, not
  repaired.
- **F-28** — `lib/parse/plausibility.ts`: per-fuel sanity bands, unit checks,
  honest annualisation (year/season pass through; month × 12 is marked derived;
  a single delivery is refused as a year), confidence scoring and flags. An
  impossible number becomes `null` with a message that quotes what was read.
- **F-30** — manual entry: fuel, two numbers, tier, install year. Eight seconds
  of typing, and the path that works with every network route deleted.
- **F-31** — address intake: Census geocode → MassGIS parcel prefill, with a
  per-field source chip and an editable year built. The town select is the
  fallback when the geocoder is down, because the verdict needs a town, not a
  coordinate.
- **F-32** — verdict screen shell at `/verdict`: one number, big, aimed at the
  back of the room, with the conservative standard-rate view, the utility at the
  address, and the arithmetic in a `<details>`. Server-rendered from the URL, so
  the answer needs no JavaScript and the link is shareable.
- `CHANGELOG.md` — this file.

### Changed

- The front page's oil figure is now read from the price adapter instead of
  hardcoded, and carries its badge and date.
- `/start` and `/` revalidate daily; `/verdict` is dynamic because it reads the
  URL.
- `npm run check` restored to include ESLint after a concurrent edit dropped it.
  A gate that skips lint is not the gate F-05 describes.

### Fixed

- `lib/geo.ts` asserted that every tract a town lists shares the town's county
  FIPS. Ninety-one legitimate links cross a county line (Taunton into Plymouth,
  Holyoke into Hampshire) and killed `next build` before it had ever run. The
  assertion now checks membership in the ACS tract table.
- `scripts/buildlog.mjs` only scanned source directories, so markers in
  `next.config.ts` and `eslint.config.mjs` — F-01 and F-05 themselves — were
  silently dropped. Root-level config files are scanned now.
- The landing page printed the withdrawn 29.2% oil-heat share after `fa96ef7`
  corrected it to 624,510 households / 22.4%. Copy now matches steering.
- A git-connected Vercel build failed with `NEXT_NO_VERSION` because `next` was
  never committed. Fixed by committing the scaffold, not by disconnecting git.
- The freshness badge said its kind only in colour. It now says it in words —
  `Prices · Snapshot · 19 Oct`, `Year built · Assessor` — so a washed-out
  projector or a colour-blind reader gets the same information.

### Notes

- **Deviation:** Next 16 rather than the 15 in the task row, and TypeScript 6.0.3
  rather than 7 — `typescript-eslint` inside `eslint-config-next` refuses the
  TS 7 API. Both are logged in the build ledger.
- **Partial, deliberately unclaimed:** `/verdict` applies a minimal
  municipal-light-plant gate (no rebate, no net cost, no payback when the town's
  electric department is municipal). F-57 stays open until F-55's coverage check
  and the full refusal copy land.
