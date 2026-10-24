---
name: "switchpoint-ma-heat-pump"
displayName: "Switchpoint: Massachusetts heat pump rules"
version: "1.0.0"
description: "Answers Massachusetts heat pump questions from the real Switchpoint rules engine instead of from memory: the verdict, Mass Save rebates for 2026 and 2027, whether a town's municipal light plant blocks rebates, and the dated DOER fuel snapshot."
keywords: ["heat pump", "mass save", "rebate", "massachusetts", "municipal light plant", "switchpoint", "oil to heat pump", "verdict", "payback"]
author: "Switchpoint team, Hackachusetts 2026"
---

# Switchpoint: Massachusetts heat pump rules

## Overview

This power gives Kiro four read-only tools backed by the same deterministic engine the
Switchpoint app ships (`lib/calc`, `lib/utility`, `data/rules/*.json`). It exists so the
agent never types a rebate, a payback or a utility from memory. When a number is needed,
call a tool. When a tool refuses, report the refusal.

## Prerequisites

- The workspace is a checkout of the Switchpoint repository (the server imports `lib/` directly).
- Node 20 or newer and `npm install` run once.
- No API keys, no network. The server is read-only and offline.

## Setup

`mcp.json` in this folder starts the server over stdio with `npx tsx mcp/switchpoint-server.ts`,
relative to the workspace root. If your Kiro version does not merge power MCP config
automatically, copy the `switchpoint` entry from `mcp/kiro-mcp.json` into
`.kiro/settings/mcp.json`.

## Available tools

| Tool | Use it when | Returns |
| --- | --- | --- |
| `compute_verdict` | Asked whether to switch, how long payback is, or what the break-even electric price is | The exact `VerdictResult`, or a typed refusal |
| `lookup_sponsor` | Asked whether a town gets Mass Save, or who serves it | Sponsors, `eligibleForMassSave` (true, false or null), seasonal-rate rule, and a question when it cannot decide |
| `get_program_rule` | Asked for a rebate rate, cap, bonus or deadline in 2026 or 2027 | One tier from `data/rules/*.json` with its source line |
| `get_fuel_snapshot` | Asked for the oil or propane price | The dated DOER snapshot |

## Rules the agent follows

1. A refusal is an answer. Never substitute a default for a missing input; ask for it.
2. `eligibleForMassSave: false` means a municipal light plant serves the town. Say no rebate applies and stop; do not quote a dollar figure.
3. `eligibleForMassSave: null` means ask which utility bills the user. Never pick the first sponsor.
4. Cite the date next to every price. The federal 25C credit expired on 2025-12-31 and is $0.
5. Everything is an estimate. A Mass Save Home Energy Assessment decides eligibility and sizing.

## Steering

- `steering/verify-a-number.md`: how to check a figure before it goes into code, a test or prose.
- `steering/before-december-31.md`: how to explain the 2027 rebate step-down without overstating it.
