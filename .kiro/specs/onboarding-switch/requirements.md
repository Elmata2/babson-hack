# Requirements — Onboarding, best case and dashboard

**Parent spec:** `../switchpoint/` (R1–R16 verdict engine, R17–R25 addendum).
**Design:** `design.md` in this folder (the full product design lives there).
**Status:** steps 1–4 and the switch/dashboard views are built (F-137–F-151).
Server accounts, outbound email and notifications are still proposed, and are listed
under "Not built" so nobody reads this spec as a claim about them.

## Problem

The verdict is a one-shot calculator. A household that gets "SWITCH_BEFORE_DEC31"
still has to find their utility's rules, shop their supply and fuel, and remember
a December deadline. The product has to carry them from "I have a bill" to "I know
what to do and by when" without asking for anything we do not need.

## Users

| Persona | Need |
| --- | --- |
| Oil-heated homeowner, Worcester County | One number they believe, and the deadline |
| Gas-heated homeowner | The honest answer, which is often "do not switch yet" |
| Municipal light plant resident (Wellesley, Belmont, Holyoke) | To be told Mass Save rebates do not apply to them |
| Limited-English household | Plain language, the same verdict |

## Requirements (EARS)

### OS1 — Profile first, without an account

**WHEN** a visitor starts the flow, **THE SYSTEM SHALL** collect a profile in four
steps (profile, bill, house, review) and hydrate the verdict query from it.

- OS1.1 The profile lives in the browser as a subscribed store. No server holds it.
- OS1.2 The anonymous path is one click from the home page and produces the same verdict.
- OS1.3 Every value on the review step carries a source badge (`bill`, `you`, `assessor`, `MassGIS`).
- OS1.4 Any OCR field below confidence 0.75 is flagged by name; one click confirms all flagged fields.
- OS1.5 Sample bills are offered inside the upload and travel through the same `read()` path as a photo.

### OS2 — Bill intake

**WHEN** the user supplies a bill, **THE SYSTEM SHALL** read it in memory and discard it.

- OS2.1 Accepts a phone photo or a PDF. Manual entry is always one tap away.
- OS2.2 A bill image is never stored. Only parsed fields are kept.
- OS2.3 A date printed as `M/D/YYYY` is normalised before validation; impossible dates are refused.
- OS2.4 A parsed field that fails the plausibility band (oil outside the DOER 10th–90th percentile band, for example) is a parse error to confirm, not a bargain to celebrate.

### OS3 — The best case, and the right to stay put

**WHEN** the profile is confirmed, **THE SYSTEM SHALL** show per-category choices from a
pure function of verdict, fuel and utility, with nothing preselected.

- OS3.1 Choices are the closed set `STAY`, `SHOP_FUEL`, `SHOP_SUPPLY`, `SWITCH_HEAT_PUMP` (R17.1).
- OS3.2 `SHOP_FUEL` appears only for oil and propane. `SHOP_SUPPLY` never appears in a municipal light plant town (R17.2).
- OS3.3 If every category says stay, the screen says "you are already on the best option".
- OS3.4 Under `DO_NOT_SWITCH_YET` the break-even electricity price is repeated directly above the heat pump choice.

### OS4 — The municipal light plant gate

**WHEN** the town is served by a municipal light plant, **THE SYSTEM SHALL** replace the
rebate line with the reason, and show no dollar figure it cannot honour.

- OS4.1 A mixed town (two sponsors) asks which utility bills the user. It never picks the first.
- OS4.2 An unknown town is `found: false` with a question, never a default sponsor.

### OS5 — Consent before any outreach

**WHEN** the user picks a shopping choice, **THE SYSTEM SHALL** show the closed list of
facts that may be shared and the providers that would receive them, and contact nobody
until the user confirms.

- OS5.1 Shareable facts are a closed list: town, ZIP, fuel, volume rounded to 50 gal, home size, tons.
- OS5.2 A name, street address, phone, email or account number is refused by `consent.ts`, not by a prompt.
- OS5.3 At most six providers per session. Hours are Eastern business hours unless allowlisted.
- OS5.4 With outreach disabled or no sender configured, nothing is sent and the UI says so.

### OS6 — Dashboard

**THE SYSTEM SHALL** show where the household stands, when it must act, and what it has asked for.

- OS6.1 "Now": utility, supply type and rate, monthly kWh, heating fuel and price, with the formula for any derived figure.
- OS6.2 A stage timeline for the switch request. Stages only move forward.
- OS6.3 Deadlines are shown, starting with the days left to 2026-12-31 (the rebate step-down).
- OS6.4 "Forget this tab" clears session state.

### OS7 — Supply comparison uses the one allowed formula

- OS7.1 `monthlyDifferenceUsd = (supplierRateCents - basicServiceCents) * monthlyKwh / 100`, with the numbers substituted on screen.
- OS7.2 Only where a Basic Service figure exists (Eversource, National Grid, Unitil).
- OS7.3 The screen never claims a town has, or lacks, a municipal aggregation program.

## Not built (proposed, kept visible on purpose)

- Server-side accounts, email one-time codes, stored profiles (Supabase in `design.md` §5).
- Outbound email and inbound reply parsing.
- Scheduled notifications and SMS.

## Correctness properties

| Id | Property | Test | Style |
| --- | --- | --- | --- |
| OP1 | Choice availability is a pure function of (verdict, fuel, sponsor); no input yields a choice outside the closed set | `lib/switch/__tests__/choices.test.ts` | fast-check |
| OP2 | No key, email or phone outside the closed fact list can reach a provider; more than six providers is refused (P17–P21) | `lib/switch/__tests__/consent-properties.test.ts` | fast-check |
| OP3 | Switch stages only move forward | `lib/switch/__tests__/session.test.ts` | examples |
| OP4 | Profile validation and the storage round-trip hold | `lib/onboarding/__tests__/flow.test.ts` | examples |

OP1 and OP2 are fast-check properties. OP3 and OP4 are example tests; they are the next
candidates. Each OP2 property asserts the refusal *code*, so a request cannot pass by
being rejected for an unrelated reason.
