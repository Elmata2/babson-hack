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

- **F-100–F-103** — Bill parser now reads service dates, utility, rate class,
  usage history, discounts, and CCF conversion. Annual estimates use printed
  history or service days when available; incomplete periods ask for household
  fill cadence. Electric bills supply electricity price unless explicitly
  marked as electric resistance heat.
- **F-104–F-106** — Address matches guard against nonresidential parcels and
  duplicate suggestions. Intake keeps bill provenance, utility rate, and
  building details through verdict link.
- **F-107–F-109** — Photo prep fixes orientation and bounds image size. Up to
  three pages go through one read. Confirmation shows uncertain fields, asks
  for missing context, applies confident reads, and supports Undo.
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
- **F-64** — address type-ahead over OpenStreetMap Nominatim, bounded to
  Massachusetts. Type `106 Chandler` and every Chandler Street in the state is
  listed with its town, because there are nine of them and only one is your
  house. Click one and the town fills, the Census geocoder resolves the tract,
  and the MassGIS parcel supplies year built. ARIA combobox with arrow keys,
  Enter, Escape; attribution rendered inside the list; one upstream request per
  second enforced by a queue; results cached in-process only and served
  `no-store`.
- **F-29** — the bill confirm screen, rebuilt against the F-76/F-77 contract. It
  shows what the document is (`document_type`, `rate_class`, date, confidence),
  lets fuel, annual units and price be edited, and prints
  `annualisation.{method, note, assumptions[], confidence}` next to the figure —
  never a bare annual number. `needs_fills` renders a 2–8 fills input and re-reads
  the same photo with the household's own cadence; `summer_month` and
  `partial_period` are questions, not errors; `stale_price` never blocks and
  carries the DOER date. Confidence is a colour and a word.
- **F-65** — bill upload beside the numbers: one photo to `/api/parse-bill`,
  the fields it read, then "Use these numbers" to fill the form. Unconfigured
  OCR says so and points at the two inputs; there is no dead end. The image is
  never previewed, kept or re-sent.
- `CHANGELOG.md` — this file.

### Changed

- The bill panel no longer hard-codes "annualised from a monthly bill". There are
  five named methods now, and the panel reads the method, note, assumptions and
  confidence off the parse instead of guessing. The copy also stopped saying "six
  fields"; the schema asks for eleven.
- The address field is a dropdown that updates while typing, not a button that
  guesses one address. The town select stays as the offline fallback, and a
  typed address the dropdown did not list can still be sent to the Census
  geocoder.
- The submit control is a summary card: what will be sent (`800 gal at $6.23 ·
  Framingham`), why it can or cannot go, and a single `See the verdict →`
  action. The old full-width black button was the ugliest thing on the page.
- `lib/parcel` accepts an optional `bufferMeters`. A geocoded address point sits
  on the street centreline, outside the parcel polygon, so `buffer=20` asks
  MassGIS for the nearest parcel — and the client only accepts a buffered hit
  when the house number matches. `match: 'exact' | 'buffered'` is in the
  response so the UI can say "Assessor (nearby)".
- `/start` and `/` revalidate daily; `/verdict` is dynamic because it reads the
  URL.
- `npm run check` restored to include ESLint after a concurrent edit dropped it.
  A gate that skips lint is not the gate F-05 describes.

### Fixed

- The freshness badge printed its kind twice when the caller passed the same
  word as the label (`Assessor · Assessor`). Duplicate parts are collapsed.
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
