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

- **F-120–F-131 — the agent beat: decide, consent, call, compare.** The verdict
  told a household whether to switch; it did not help them act. This adds the half
  of Addendum A that was still a slide. `lib/calls/` holds the wire vocabulary
  (`Cited<T>` — every field nullable, every value carrying the sentence that
  produced it), the parse boundary (an untrusted payload in, redacted excerpts and
  typed fields out), the dial plan, the platform client (three fetches, typed
  failures, no retries) and the staged replay. `POST /api/calls` places calls only
  when an agent, a consent body and a permitted line all line up: `PROVIDER_CALLS_ENABLED`
  is the only way a real business is dialled (R19.8), team test lines are exempt
  from business hours so a Saturday demo works (R19.6), and a vendor failure is one
  `failed` row rather than a dead session. `GET /api/calls/[sessionId]` polls the
  conversation ids the *browser* holds — no database, no webhook (ADR-010) — and
  `DELETE` forgets them. The comparison screen sorts with `lib/switch/quotes.ts`
  (already property-tested) and never promotes a row it does not believe: a dealer
  who says ninety-nine cents is shown and not ranked, a prebuy is a bet and not a
  price. "Use this price" writes the effective price into the verdict's own `price`
  key, so the household sees the verdict change — including when a cheaper oil price
  flips it to *don't switch yet*, which is the product working. The one negotiation
  round (R21) cites a price only from a ranked quote and asks at most two dealers,
  never naming the one it came from.
- **F-123/F-131 — the agents are reviewed configuration, not a dashboard.** Two
  folders under `agents/`: the outbound quote caller (fuel and installer scripts,
  the disclosure verbatim from steering, nine and six extraction fields, four-minute
  cap, no server tools) and the inbound verdict line (four languages, one
  `compute_verdict` tool). The inbound route runs the *same* `computeVerdict` as the
  web screen and returns a finished sentence per language, because R23.2 says the
  model reads the number back and never computes it. Both routes are off by default:
  a missing secret is a 503, an unconfigured agent is an `off` plan with a sentence,
  never a fake ring.
- **F-134–F-136 — CI for the parts vitest cannot see.** Contract tests read the
  prompt files as data: the first message must equal `DISCLOSURE_TEMPLATE`, the
  extraction schema must name exactly the fields `parse.ts` reads, and hostile
  transcripts (refusal, voicemail, ninety-nine cents) must extract and rank the way
  the product claims. Two workflows: simulation on PRs touching `agents/**` — which
  runs the offline half always and the platform half only with an account, and says
  which one it ran — and a config push on merge to master, so the deployed agent is
  the reviewed one.
- **F-52 — the demo video, cut from the live app.** `scripts/demo/record.mjs` renders
  nine beats of the real product in `?demo=1` mode with headless Chrome, narrates them
  with macOS `say`, and assembles one 1:37 H.264 cut at `public/demo/switchpoint-demo.mp4`.
  The storyboard lives in the script, so a copy change is a re-run, not a re-shoot.
  The Wellesley beat — *Mass Save rebates do not apply at this address* — is beat five.
- **F-53/F-54 — the submission asks the repository.** `scripts/submission/check.mjs`
  checks that the repo is public, `.kiro` is committed and not gitignored, the README
  quotes C2 and names its datasets, the build log says every row is built and is not
  drifted, the video is under three minutes, and the three workflows exist. The one
  row it cannot check — the track chosen on the portal — is printed as MANUAL and
  never counted as a pass. `--review` adds the F-54 read: commits, ahead/behind
  `origin/master`, a dirty tree, and the last twelve commits.
- **P13–P16** — the four quote-ranking properties, as properties: order-independence,
  an implausible price never ranked, `effectivePerGal` never below the quoted price,
  and the negotiation price always one of this session's ranked rows.

### Fixed

- **`?demo=1` could not contact anyone.** `POST /api/switch` validated the body
  against the closed key list *before* it read the demo flag, and `demo` was not on
  that list, so the exact body the switch screen sends in demo mode came back
  `unknown_field`. The flag is now part of the closed set (with `sessionId`), and two
  regression tests pin the shape the screen actually sends.


- **F-153** — R7.2: the installed cost is editable, and says where it came from.
  The verdict screen and the intake form both take a contractor quote; leaving it
  blank keeps the Mass Save average of $22,000 with a program-data badge, and the
  value rides in the link as `ic` behind a $1,000–$250,000 plausibility band, so a
  slipped zero cannot silently stretch a payback. `cashFlow()` in
  `lib/calc/finance.ts` now derives the loan payment, the monthly saving and
  `monthlyCashFlow` once — property-tested — and the cash-flow module reads that
  difference instead of dividing again. Provenance follows the source: the average
  cites Mass Save, a typed quote cites the household.
- **F-143–F-152 — the switch flow (Addendum B steps 5–6).** `/switch` shows four
  best-case rows (supply, fuel, heat pump, programs) derived from the verdict's own
  numbers — never an invented disposition — and a decision gate where nothing is
  preselected: staying is a button with the same weight. Choices are arithmetic, not
  taste: a dealer exists for oil and propane, supply can only be shopped where an
  investor-owned utility or Cape Light Compact delivers, and a heat pump is always on
  the table. Consent is a closed fact list enforced in code, so a hand-crafted POST
  cannot add a name, street or phone number to what an agent may say; calls are
  clocked to Eastern business hours; the six-provider cap holds. Quotes are ranked on
  cash/COD only — prebuy and price-cap offers, out-of-band numbers and a dealer whose
  minimum exceeds the delivery are flagged rather than ranked. `POST /api/switch` is
  a gate, not an integration: with `PROVIDER_OUTREACH_ENABLED` unset it sends nothing
  and says so, allowlist rows are staged and labelled as team test lines, and a phone
  channel returns `unsupported` instead of a fake `ringing`. The request lives in
  `sessionStorage` with its consent snapshot, so `/dashboard` can show the stage
  timeline in this tab and "forget this tab" really forgets. The verdict's own link
  carries the whole query into `/switch`. R8.3 is now enforced at the display edge:
  `verdictNotes()` floors every rendered verdict at two reasons and one caveat instead
  of slicing a raw array.
- **F-75 — the Energy lens reads real data.** `public/data/ma-town-energy.json` joins
  three public datasets to the 351 town polygons the map already draws: Mass Save's
  town-by-town residential MWh, MassCEC's installed solar DC MW (as of 2025-01-14),
  and ISO-NE zonal demand via EIA-930 (three zones × 24 hours, hour ending 1 AM
  local). Each figure carries its source and date in `_meta`; a town without a
  reported residential number says why — `municipal`, `suppressed` — instead of
  receiving an estimate. The bake fails if a drawn town is missing from a CSV or a
  load day is not 3 × 24.
- **F-80/F-81 — sample bills and an eval harness.** `npm run bills` renders the
  synthetic documents in `public/demo-bills/` from the parse fixtures, so the picture
  the vision route reads and the JSON the tests assert cannot drift: oil tickets,
  Eversource-layout electric and gas bills with the sample's own line items and meter
  table, the 106 Chandler demo pair, a not-a-bill that must be refused, and fixture B
  photographed on a table. `npm run bills:eval` posts every sample to
  `/api/parse-bill` and diffs what the model read (fuel, document type, date, rate
  class, price) against the manifest, exiting non-zero on a mismatch.
- **F-32–F-40 — the verdict screen is the product now.** The answer renders as a
  three-stop dial (icon, label, colour; the active stop marked) and the household's
  old annual cost turns over into the heat-pump cost in 900ms — or instantly under
  `prefers-reduced-motion`. Every headline figure (savings, rebate, net cost,
  payback, degree days, tonnage, fuel use, SCOP) is a button that opens a drawer
  with its formula, the values substituted and the publisher/document/date behind
  it. The two $500 rebate bonuses are URL toggles, the 2026→2027 step-down is
  stated in dollars for this house, the 0% HEAT Loan payment sits beside the
  monthly saving (positive or short), the defaults and disclaimer are on the page
  without a fold, and `/api/explain` returns three plain-English sentences from
  the page's own numbers — a model may write them, but a sentence that invents a
  figure is discarded for the deterministic version. Three live demo links (oil +
  enhanced → switch now, propane → before 31 Dec, gas → don't switch yet) recompute
  on the real engine rather than replaying a fixture.
- **F-35** — the rebate stack (R5) is now a screen, not a footnote. It names the
  tier chosen and why, prints every line item with its source, and shows the cap
  as its own negative line so the stack adds up to the award it claims. The two
  +$500 bonuses are individually toggleable and appear only on the tiers that pay
  them: each toggle is a link carrying `wz`/`sz`, so the verdict stays a server
  render and "Change the numbers" cannot drop the household's claim. Gas homes
  that asked for the income-qualified tier get the exclusion and the reason in
  words, not a silently downgraded number. A "what changes on 1 January 2027"
  line states the step-down in this household's dollars. The install year now
  defaults to today, and the engine is handed the $22,000 default quote, which
  fixes an enhanced-tier selection from `/start` refusing to price at all.
- **F-137–F-141** — `/onboarding`: the four-step wizard from Addendum B, steps
  1–4. A profile (name, email, optional phone) kept in this browser via
  `useSyncExternalStore` — no server account, no password, and the screen says so;
  the bill step reuses `BillUpload` unchanged; the house step asks town, fuel, two
  numbers and the two Mass Save questions; the review step hands the existing
  query contract to `/verdict`, so provenance survives. Synthetic sample bills
  from `public/demo-bills` load into the same reader as a photo, and a number read
  from a household's own document now carries a `bill` badge instead of "You
  entered". The home hero and header gained "Create profile"; `/start` stays one
  click away for the anonymous path.
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
- **F-110** — PDF upload now renders up to three pages to JPEG in the browser.
  OpenRouter receives images, and the PDF never leaves the device.
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

- **F-36** — the provenance drawer is a native `<dialog>`. The figure button keeps
  its formula, its substituted values and its publisher/date, but focus, Escape and
  the backdrop now come from the platform rather than a hand-rolled trap, and a
  coverage test asserts every headline figure has an entry instead of trusting the
  page to keep them in sync.
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
- **F-79** — bill OCR now prefers the Babson seminar LiteLLM gateway
  (`claude-sonnet-5`) over the OpenRouter workaround, via `BABSON_GATEWAY_KEY`,
  `BABSON_GATEWAY_URL` and `BABSON_GATEWAY_MODEL`. The gateway answers the
  Anthropic Messages shape at `/v1/messages` with an `x-api-key` header, so it
  shares one reader with the console-key path — and unlike OpenRouter it accepts
  PDFs. `claude-sonnet-5` rejects `temperature`, so that field is omitted for the
  gateway; sending it would have 400'd every bill. Precedence is gateway →
  console key → OpenRouter → typed "not configured", and the UI's `reader`
  provenance now reports `babson`.

### Fixed

- **Build log** — a marker that named two features (`F-148 / F-149`, `F-13/F-61`)
  only ever logged the first, so F-149 and F-151 were built, tested and shipped but
  never counted. The scanner now reads every id on the line, and the `(?=\s|$)`
  guard stops a malformed id like `F-26a` from being logged as `F-26`. F-75's four
  map markers were also still unsynced: the ledger and `BUILDLOG.md` now carry them.
- **F-142** — A date printed the way Massachusetts actually prints it
  (`10/20/2026`) was thrown away, because `asDocumentDate` accepted only
  `YYYY-MM-DD`. The model copies the printed digits, so the reader's own sample
  oil ticket lost its delivery date, raised `document/out_of_range`, and blocked
  auto-apply. The normalisation now happens in code — the same place `asUnit`
  turns `gallon` into `gal` — with the year band unchanged and impossible dates
  (`19/10/2026`, `4/31/2026`, two-digit years) still refused. The prompt also
  says which way to copy. Verified against `g-chandler-oil-ticket.png`:
  `documentDate: 2026-10-20`, `ready: true`, no flags.
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
