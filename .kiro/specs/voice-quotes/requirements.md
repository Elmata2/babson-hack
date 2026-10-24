# Requirements — Voice quotes and the comparison screen

**Parent spec:** `../switchpoint/` Addendum A (R17–R25). This spec is the focused
slice for the quote-calling agent, so the rules that bind it can be read, tested and
reviewed on their own.
**Steering that binds it:** `../../steering/voice-agent-rules.md` (wins over this file on
any disagreement). **Status:** the agent config, contract tests, consent gate and ranking
are built. Calling real businesses is off unless the deployment turns it on.

## Why a separate spec

A phone agent is the one place the product speaks for a household. Its rules are
safety-critical and test-driven, and they change on a different cadence from the
verdict engine. Keeping them in their own spec lets a reviewer read every promise the
agent makes without reading the whole product.

## Requirements (EARS)

### VQ1 — The first sentence is fixed

**WHEN** a call connects, **THE AGENT SHALL** open with the disclosure from steering,
verbatim, before any question.

- VQ1.1 The text is `agents/quote-caller/first-message.txt` and equals `DISCLOSURE_TEMPLATE`. Changing it is a spec change, not a copy edit.
- VQ1.2 It says the caller is an automated AI assistant, that the call is recorded and transcribed, and asks permission to continue.
- VQ1.3 A "no" ends the call politely with status `declined`.
- VQ1.4 Both vertical prompts (fuel, installer) open with the same disclosure.

### VQ2 — What the agent may say, and never says

- VQ2.1 It may say: town, ZIP, fuel, annual volume rounded to 50 gal, tank size, delivery window, home size in sqft, estimated tons. A competing price **only** when code passes `{target_price}`.
- VQ2.2 It never says: a name, street address, phone number, email, account number, payment detail or income.
- VQ2.3 It never agrees to buy, books nothing, names no other provider, never claims to be human and never dodges the question when asked.
- VQ2.4 It stops on "no", "stop" or "take me off your list", and leaves no voicemail.
- VQ2.5 A call ends at four minutes.
- VQ2.6 The consent gate (`lib/switch/consent.ts`) refuses any request that carries a field outside this list, whatever the prompt says. The prompt is not the control.

### VQ3 — A quote is a claim, not a fact

**WHEN** a call ends, **THE SYSTEM SHALL** extract a typed `ProviderQuote` in which every field is nullable and carries its evidence.

- VQ3.1 An unanswered question is `null`, never `0`.
- VQ3.2 The extraction schema names exactly the fields `lib/calls/parse.ts` reads.
- VQ3.3 A figure is shown with its excerpt and time and labelled *Phone quote, not a contract.*
- VQ3.4 The model never computes a total, a saving or a rank.

### VQ4 — Ranking is code

- VQ4.1 `effectivePerGal = pricePerGal + deliveryFee / deliveryGallons`, plus a card surcharge when the user pays by card (R20.2).
- VQ4.2 Plausibility gate: oil $4.50–8.50/gal, propane $2.00–6.00/gal, installer $2,000–12,000/ton. A quote outside it is `unverified`: shown, never ranked.
- VQ4.3 Prebuy and price-cap offers are shown, never ranked.
- VQ4.4 The price cited in a negotiation round always equals a ranked quote from this session, and the provider it came from is never named.
- VQ4.5 Ranking cannot be bought: no referral fees, no paid placement, no lead sales.

### VQ5 — Consent and outreach limits

- VQ5.1 Nothing is dialled until the user confirms a screen that lists the providers and the closed fact list.
- VQ5.2 At most six providers per session; at most two in a negotiation round.
- VQ5.3 Calls go out only in Eastern business hours (Mon–Fri 08:00–17:00, Sat 08:00–12:00), except to allowlisted team lines.
- VQ5.4 Real businesses are contacted only when the deployment enables outreach. Otherwise the numbers come from a team allowlist, and with no allowlist the screen offers the switch kit instead.

### VQ6 — The agent config is reviewed code

- VQ6.1 Prompts, first message and extraction schema live in `agents/` and are pushed to the platform from the repository, so what a phone hears is what a reviewer read.
- VQ6.2 A pull request that touches `agents/**` runs the simulation workflow; the offline half always runs and the platform half runs only when the secrets exist.

## Legal basis (verify before calling real businesses; this is not legal advice)

Massachusetts is an all-party consent state for recording (M.G.L. c.272 §99), so
disclosure comes before any question. The FCC's February 2024 ruling treats AI voices as
"artificial" under the TCPA; it targets consumer calls and we call business lines for
information on a homeowner's request, but we disclose and honour opt-out as a choice.

## Correctness properties

| Id | Property | Test | Style |
| --- | --- | --- | --- |
| VP1 | The disclosure text is one text across steering, config and both prompts | `agents/__tests__/contract.test.ts` | examples |
| VP2 | Ranking is order-independent (P13) | `lib/switch/__tests__/quotes-properties.test.ts` | fast-check |
| VP3 | A quote outside the plausibility gate is never ranked (P14) | same | fast-check |
| VP4 | Fees never make a price cheaper (P15) | same | fast-check |
| VP5 | The negotiation price always comes from a ranked quote (P16) | same | fast-check |
| VP6 | No key, email or phone outside the closed fact list reaches a provider (P17–P21) | `lib/switch/__tests__/consent-properties.test.ts` | fast-check |
| VP7 | A hostile $0.99/gal transcript never produces a ranked row | `agents/__tests__/contract.test.ts` | examples |
