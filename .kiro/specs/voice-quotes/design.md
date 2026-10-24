# Design — Voice quotes

Full narrative: `../switchpoint/design.md` §12 (decide, consent, call, compare), §13
(comparison screen), §14 (continuous integration), and ADR-005, ADR-010, ADR-011.
This file is the map from each requirement to the code that owns it.

## Shape

```
verdict ──▶ choices (pure) ──▶ consent screen ──▶ POST /api/switch ──▶ outreach
                                   │                     │
                         lib/switch/consent.ts     provider allowlist
                         (closed fact list)        (data/providers/*.json)
                                                         │
            ElevenLabs agent ◀── agents/quote-caller ◀───┘
                    │ transcript + extraction
                    ▼
            lib/calls/parse.ts ──▶ ProviderQuote (nullable, with evidence)
                    │
                    ▼
            lib/switch/quotes.ts ──▶ plausibility gate ──▶ rank ──▶ comparison screen
```

The model sits in exactly two boxes: the agent that talks, and the extraction that
reads the transcript. Every box that decides something is code.

## Requirement to code

| Requirement | Owner |
| --- | --- |
| VQ1 disclosure | `agents/quote-caller/first-message.txt`, `DISCLOSURE_TEMPLATE`, contract tests |
| VQ2.1–2.2 closed fact list | `lib/switch/consent.ts` (`FACT_KEYS`, `findIdentifyingField`, `NEVER_SAID`) |
| VQ2.3–2.5 refusals, 4-minute cap | `agents/quote-caller/prompt.*.md`, `agent.json` |
| VQ3 typed quote | `lib/calls/parse.ts`, `agents/quote-caller/data-collection.json` |
| VQ4 ranking | `lib/switch/quotes.ts` |
| VQ5 consent and limits | `lib/switch/consent.ts`, `app/api/switch/route.ts`, `lib/switch/providers.ts` |
| VQ6 config as code | `scripts/agents/sync.mjs`, `.github/workflows/agent-sync.yml`, `agent-sim.yml` |

## Decisions

**The prompt is not the control.** A prompt can be talked around. `consent.ts` refuses a
request that carries a forbidden field before any call exists, and the property tests
(P17–P21) hammer that refusal with generated keys, emails and phone numbers. The prompt
repeats the rule for the model's benefit; the code enforces it.

**Poll, do not take webhooks (ADR-010).** The browser holds the conversation ids and
polls, so the server stays stateless and there is no store to leak.

**The agent gathers, the user decides (ADR-011).** The agent never agrees to anything.
The output is a ranked table and a switch kit; signing is the user's act.

**A claim is not a fact.** Phone quotes pass the plausibility gate and are labelled as
claims. A price that looks too good ($0.99/gal oil) is an extraction error until proven
otherwise, and it never reaches a ranked row.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| No ElevenLabs or Twilio keys | Outreach is off; the screen offers the switch kit and published options |
| Outreach disabled in production | Only allowlisted team lines are dialled |
| No answer, voicemail, IVR dead end | Typed status, no message left |
| Provider asks to call back | "The homeowner will contact you"; quote marked `needs_callback` |
| Extraction returns an implausible price | `unverified`, shown, never ranked |
