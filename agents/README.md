# `agents/` — the voice agents, as reviewed code

**@built F-123 the quote-caller agent — prompts, first message, extraction schema**
**@built F-131 the inbound verdict line — four languages, one server tool**

Two agents live here, and both are configuration the repository owns. The deployed
copy is pushed from these files by `scripts/agents/sync.mjs` on merge (F-136), so what
a phone hears is what a reviewer read.

## `quote-caller/` — outbound, consented, four minutes

| File | What it is |
| --- | --- |
| `first-message.txt` | The disclosure, verbatim from `.kiro/steering/voice-agent-rules.md`. CI asserts it equals `DISCLOSURE_TEMPLATE`. |
| `prompt.fuel.md` | Fuel dealers: six questions, then close. |
| `prompt.installer.md` | Installers: five questions, then close. |
| `data-collection.json` | Post-call extraction. Field names are the ones `lib/calls/parse.ts` reads; `agents/__tests__/contract.test.ts` keeps them equal. |
| `agent.json` | Four-minute cap, `end_call` + voicemail detection, **no server tools**, retention, the vertical variable. |

The vertical is chosen per call through the `vertical` dynamic variable, so one agent
covers both scripts and there is nothing to redeploy between beats.

## `verdict-line/` — inbound, four languages

| File | What it is |
| --- | --- |
| `prompt.md` | Collects four facts, calls `compute_verdict`, reads the line back verbatim. English, Spanish, Portuguese, Haitian Creole. |
| `agent.json` | The tool contract: `POST /api/voice/verdict` with `x-voice-secret`, off unless `VOICE_TOOL_SECRET` is set. |

The rule that matters (ADR-005, ADR-011): **the model never computes**. The route runs
`computeVerdict` and returns finished sentences per language; the prompt forbids
editing a figure. A loss is read as a loss.

## Running it

```bash
npm run agents:check      # offline validation: disclosure, duration, schema
npm run agents:simulate   # offline contract half; platform half only with an account
npm run agents:sync       # push the reviewed config (needs ELEVENLABS_API_KEY + _AGENT_ID)
```

`--create` on the sync script makes the agent once and prints its id.

## What is not in this folder

No keys, no phone numbers, no transcripts. Business lines live in
`data/providers/*.json` with their source and date (R22.3), and the seed there is test
lines only — see that folder's README for why.
