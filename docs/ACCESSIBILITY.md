# Accessibility and equity

What the repository checks automatically, what it does not, and who the product is for.
Requirements: R14 (accessibility and equity) and R15 (privacy) in
`.kiro/specs/switchpoint/requirements.md`.

**Scope of the claim.** These are automated checks that run on every `npm run check`.
They are evidence, not a WCAG conformance statement. Full validation needs manual testing
with a screen reader, keyboard-only use and zoom, plus expert review. We have not done
that review and do not claim it.

## What is checked on every build

| Concern | How it is checked | Where |
| --- | --- | --- |
| Text contrast | The colour tokens are parsed out of `app/globals.css`, converted from OKLCH to sRGB, and every documented text pair is asserted to clear 4.5:1, even where 3.0 would be allowed | `lib/a11y/__tests__/contrast.test.ts` |
| Colour is never the only signal | The three verdict tones are asserted to be far enough apart in the palette, and each verdict also carries a label and an icon | same |
| The one translucent surface | The sticky header is asserted readable over the darkest thing it scrolls across | same |
| Skip link and landmarks | The skip link is the first element in the body and points at a `main` that exists on every page that renders one | `lib/a11y/__tests__/keyboard.test.ts` |
| Visible focus | The focus ring is drawn separately from the text colour | same |
| The provenance drawer | Opens from a real button announced as opening a dialog, is a native `<dialog>` (platform Escape and focus trap), has a labelled close button, and keeps focus inside when open | same, plus `focus.test.ts` |
| Every headline figure is reachable | Each figure on the verdict screen goes through the drawer, and the dial is described in words, not only drawn | `keyboard.test.ts` |
| Reading level | A documented Flesch-Kincaid implementation scores the verdict copy against an 8th-grade budget; the test also asserts every figure is one the verdict already contains | `lib/a11y/__tests__/readability.test.ts` |
| No tracking | No analytics package, no cookie read or written by app code, none configured in Next | `lib/a11y/__tests__/privacy.test.ts` |
| Language and motion | `<html lang="en-US">`; `prefers-reduced-motion` is honoured in `app/globals.css` | `app/layout.tsx`, `app/globals.css` |

## Equity: who this is built for

- **Households paying the most.** 624,510 Massachusetts homes (22.4% of occupied units, ACS B25040)
  heat with oil, which averaged $6.23 per gallon in the week of 2026-10-19, up from $3.55 a year earlier.
- **Households the programs miss.** Municipal light plant customers get no Mass Save electric rebates.
  The app resolves the sponsor first and says so, instead of quoting a rebate that will never arrive.
- **Income-qualified households.** The enhanced offer (up to $16,000, or no cost through Turnkey)
  is surfaced instead of buried (R14.3). Thresholds come from Mass Save's published table; a household
  within 5% of its limit is told to verify, with the verification number.
- **Limited-English households.** The MassGIS EJ2020 layer carries the limited-English share by block group
  and drives the map overlay. A voice line that reads the verdict in English, Spanish, Portuguese and Haitian
  Creole is configured in `agents/verdict-line/`, and it reads sentences the engine wrote; the model never
  computes a figure.
- **No account to start.** The anonymous path needs no sign-up, no email and no stored image. A bill photo is
  read in memory and discarded.

## Known gaps

- No manual screen-reader pass has been done.
- The written interface is English. The multilingual path today is the voice line, not the web UI.
- Reading level is measured with a deliberately coarse heuristic; it keeps the writing honest, it is not a
  validated readability study.
