---
inclusion: auto
name: property-testing
description: Which requirements get property-based tests and which get examples, and how to write a property for this repo. Use when adding or changing anything under lib/calc, lib/switch/quotes, or the MCP tool handlers, or when a property test fails.
---

# Steering — Property-based testing

fast-check is the tool. The calc engine is the product, so its invariants are
properties, not hand-picked examples.

## Where a property is required

| Area | Property | Where |
| --- | --- | --- |
| `lib/calc` | P1 delivered heat is positive for any positive bill; P12 MMBtu → BTU → MMBtu round-trips | `lib/calc/__tests__/properties.test.ts` |
| `lib/calc` | P2 a higher fuel price never lowers savings; P3 a higher electricity price never raises them | same |
| `lib/calc` | P4 the rebate never exceeds the install cost; P5 caps hold before and after bonuses; P13 the stack sums to the printed total | same |
| `lib/calc` | P6 payback is exactly netCost / savings; P7 the savings sign agrees with the break-even price | same |
| `lib/calc` | P8 the 2027 rebate is never larger than 2026 for the same tons | same |
| `lib/calc` | P9 determinism; P10 no NaN, no Infinity, no negative kWh; P11 totality, hostile inputs refused not guessed | same |
| `lib/switch/quotes` | P13 ranking is order-independent; P14 a quote outside the plausibility gate never gets a rank; P15 fees never make a price cheaper; P16 the negotiation price comes from a ranked quote | `lib/switch/__tests__/quotes-properties.test.ts` |
| `lib/switch/consent` | P17 an unknown top-level key, P18 an unknown fact key, P19 an email, P20 a phone number in a free-text fact, P21 more than six providers: always refused, with the right reason code | `lib/switch/__tests__/consent-properties.test.ts` |
| `mcp/tools` | A refusal never carries a verdict; an answer never carries NaN | `mcp/tools.test.ts` |

## Where an example is enough

Copy, layout, route wiring, formatting. Do not write a property for a string.

## Rules

- When a property fails, **fix the engine**. Never narrow the generator, loosen the
  assertion, or add an example that sidesteps the counterexample.
- Keep the shrunk counterexample. A failing seed that found a real bug becomes a
  named regression test next to the property, with a comment saying what it caught.
- Generators produce hostile values on purpose: `NaN`, negatives, zero, a billion
  gallons. The refusal list in `refusalFor` is the contract they test.
- Time and randomness are injected; the properties must be reproducible from a seed.
