---
inclusion: auto
name: mcp-tools
description: How to check a number, a town or a rebate against the real engine through the Switchpoint MCP server instead of computing it in prose. Use when asked for a verdict, a payback, a rebate amount, whether a town gets Mass Save, or when writing a test fixture that needs a known-good value.
---

# Steering — Use the Switchpoint MCP server for numbers

The product rule is that the model never produces a number that reaches the
screen. The same rule binds the agent while it builds. The `switchpoint` MCP
server (`mcp/switchpoint-server.ts`, configured in `.kiro/settings/mcp.json`)
exposes the real engine, so ask it.

| Question | Tool | Notes |
| --- | --- | --- |
| "What is the verdict / payback / break-even for this house?" | `compute_verdict` | Returns the exact `VerdictResult` the UI renders, or a typed refusal. A refusal is the answer; do not fill in a default. |
| "Does Wellesley get Mass Save rebates?" | `lookup_sponsor` | From the baked MassGIS table. `eligibleForMassSave: null` means ask the user, never pick the first sponsor. |
| "What is the 2027 whole-home rebate?" | `get_program_rule` | Reads `data/rules/*.json`. Only 2026 and 2027 exist. |
| "What does oil cost this week?" | `get_fuel_snapshot` | DOER snapshot, dated. Cite `asOf`. |

## Rules for the agent

- Never type a rebate, rate or payback into code, a test or prose from memory.
  Call the tool, or read `mass-save-rules.md`.
- When a test needs a fixture value, get it from `compute_verdict`, then assert the
  *property* (sign, bounds, monotonicity) rather than pasting the number, unless it
  is a documented anchor in `lib/calc/__tests__/anchor.test.ts`.
- If the tool and the steering file disagree, stop and say so. One of them is wrong
  and it is not the agent's call which.
- The server is read-only and offline. It cannot fetch live prices; that is the app's
  job, with a baked fallback.
