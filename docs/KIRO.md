# How we used Kiro

This is the write-up the Hackachusetts rules ask for. Every claim names a file you can
open. Where something is unfinished or unverified, the text says so.

**Which Kiro surfaces.** Everything described here was done in the Kiro IDE: specs, steering, hooks, the
MCP server and the agent chat. We have no record of using Kiro CLI, Web or Crew, so we do not claim them.

## At a glance

| Kiro capability | What we did | Evidence |
| --- | --- | --- |
| Specs | Three specs: the verdict engine, onboarding and switch, voice quotes. EARS requirements, correctness properties, F-numbered tasks | `.kiro/specs/switchpoint/`, `.kiro/specs/onboarding-switch/`, `.kiro/specs/voice-quotes/` |
| Steering | Ten files across all four inclusion modes. Program rules are a hard constraint; machine-readable rules are pulled in by file reference | `.kiro/steering/` |
| Hooks | Ten hooks in the v1 format: command and agent actions on save, task completion, session start and before tool use | `.kiro/hooks/` |
| MCP | A read-only server that exposes the real engine, the sponsor gate and the rule tables as four tools | `mcp/`, `mcp/kiro-mcp.json` |
| Property-based testing | 22 named properties with fast-check, plus a mutation check that shows what they catch and what they miss | `lib/calc/__tests__/properties.test.ts`, `scripts/pbt-mutation-check.mjs` |
| Powers | One power we authored, wrapping the MCP server and two steering guides | `power/switchpoint-ma-heat-pump/` |
| Build log | Every shipped feature is a `@built F-NN` marker in code, read by a script | `BUILDLOG.md`, `.buildlog/events.jsonl` |

## The idea that organises all of it

**The model must never produce a number that reaches the screen.** The product enforces
that at runtime: the engine computes, the model reads a bill and writes a sentence. Kiro
enforces the same rule at build time: program numbers come from steering and from tools
that call the engine, never from the model's memory. Each Kiro feature below is one more
way of making that rule mechanical instead of aspirational.

## Specs

We started from the spec. After the README stub, the first real commit is the spec
(`10b61d7 feat(spec): Switchpoint spec v1 — requirements, design, tasks, steering, build log`),
before any engine code.

- **Requirements** are numbered (R1–R25) with EARS clauses ("WHEN ... THE SYSTEM SHALL ...") and acceptance
  items (R17.2, R20.3). Code, tests and comments cite those numbers, so a reader can walk from a line of code
  to the sentence that required it.
- **Design** records module contracts, the formula sheet with units, a failure-mode ranking, and ADRs
  (ADR-001 no Zillow, ADR-003 no database, ADR-005 the model extracts and code ranks, ADR-010 poll instead of
  webhooks, ADR-011 the agent gathers and the user decides).
- **Tasks** are F-numbered rows with an owner, an estimate and dependencies. The build log counts against those rows.
- **Split by feature.** The original spec grew two addenda. We split them into `onboarding-switch` and
  `voice-quotes`, each with its own requirements, design and tasks, plus a table of correctness properties that
  names the test for each one and says honestly whether it is a fast-check property or an example test.
- **Not built stays visible.** Each spec has a "Not built" or "Next" list (server accounts, outbound email,
  notifications) so the spec never claims more than the code does.

**A case where one source of truth paid off.** The landing page briefly said 29.2% of Massachusetts homes
heat with oil (1.82M homes). That came from a Mass.gov table whose totals (6.2M) do not reconcile with the
state's roughly 2.8M occupied units. Recomputed from the baked ACS layer it is 624,510 of 2,785,042, or 22.4%.
The correction was written once, in `.kiro/steering/product.md` and the design (`fa96ef7`, with the reasoning),
and the stale copy on the landing page and share card was then fixed to match (`da7cc46`). Because the number and
its dated source live in steering, "which figure is right" had one answer to point at.

How it compared with vibe coding: the spec made disagreement cheap. Two people could argue about R17.2 in a sentence
instead of in a diff. The `spec-drift` hook turns that into a check after every task. Vibe coding was fine for
layout and copy, and we used it there.

## Steering

Ten files, using all four inclusion modes on purpose, so context is loaded when it matters and not otherwise.

| Mode | Files | Why |
| --- | --- | --- |
| `always` | `product`, `mass-save-rules`, `units-and-conventions` | Rules every change must obey: no invented numbers, the 2026/2027 tables, units and constants |
| `fileMatch` | `data-sources`, `supply-market`, `voice-agent-rules` | Loaded only when touching providers, supply code or the call agent |
| `auto` | `buildlog`, `mcp-tools`, `property-testing` | Loaded when the request matches their description |
| `manual` | `submission-checklist` | Pulled in with `#submission-checklist` before the deadline |

The strategy that made the biggest difference: **steering is the source of truth for program numbers, and
`mass-save-rules.md` says so in its first lines.** It also pulls the machine-readable rule files in through
`#[[file:data/rules/heat-pump-2026.json]]`, so the prose and the JSON the engine parses are read together. If
they disagree, the document wins and the JSON is the bug. A second rule that paid off: `supply-market.md` lists
what we must *not* claim (that a town has an aggregation program, a Nantucket rate, a rate after the January
2027 reset), which stopped plausible-sounding guesses at the source.

## Hooks

| Hook | Trigger | Action | Why |
| --- | --- | --- | --- |
| `buildlog-sync` | save under `lib/`, `app/`, `components/`, `agents/`, `mcp/` | command: `node scripts/buildlog.mjs hook` | The log is updated in the same save as the marker, never reconstructed at the end |
| `pbt-guard` | save under `lib/calc/` (not tests) | agent prompt | Run the property suite; fix the engine, never weaken the property |
| `rules-regression` | save of `data/rules/*.json` | command: `npx vitest run lib/calc mcp` | A typo in a rebate table cannot reach the screen |
| `protect-kiro-dir` | before `fs_write`, `str_replace`, `fs_append`, `execute_bash` | command: `scripts/hooks/protect-kiro.mjs`, exit 2 blocks | A `.gitignore` rule for `/.kiro` disqualifies the submission; this stops the write itself |
| `task-quality-gate` | after a spec task completes | command: `npm run check` | Typecheck, lint and all tests after every task |
| `spec-drift` | after a spec task completes | agent prompt | Diff the code against the spec and list gaps, largest first |
| `session-status` | session start | command: `node scripts/buildlog.mjs status` | Every session starts from what is actually built |
| `scenario-check` | save under `lib/verdict`, `lib/calc`, `lib/switch`, `data/rules` | agent prompt | Re-run the 16-scenario pack (`lib/scenarios`) and report any scenario whose outcome moved |
| `steering-guard` | save of `data/rules/*.json` or a steering file | agent prompt | Every changed figure needs a source URL and read date, and rules and steering must agree |
| `pre-commit-guard` | before a `git commit` command | command: `scripts/hooks/pre-commit-guard.mjs` | Run the `/.kiro` guard; remind the agent to run `npm run check` |

`protect-kiro.mjs` has its own self-test (`npm run hooks:test`, nine cases including a quoted `echo ".kiro" >> .gitignore`).

**Honest note.** The hooks were first written in an older file schema (`when` / `then`), and we never saw them fire.
All ten were rewritten in the current v1 format, with PascalCase triggers and `command` or `agent` actions. Hooks
load at session start, so they take effect from the next session, and **we have not yet observed one firing inside
Kiro**, so we do not claim that any did. The scripts behind them are ordinary commands that also run by
hand (`npm run log`, `npm run status`, `npm run check`), and CI runs the same checks, so no guarantee depends on a
hook firing.

## MCP

`mcp/switchpoint-server.ts` is a stdio server built on the official TypeScript SDK. It is read-only and offline.

| Tool | Answers | Backed by |
| --- | --- | --- |
| `compute_verdict` | The verdict, payback, break-even price, reasons, caveats, assumptions, or a typed refusal | `lib/calc` |
| `lookup_sponsor` | Sponsor(s), whether Mass Save applies, seasonal rate rule, or a question to ask | `lib/utility` and the baked MassGIS table |
| `get_program_rule` | One rebate tier for 2026 or 2027 with its source line | `data/rules/*.json` |
| `get_fuel_snapshot` | The dated DOER snapshot | `data/snapshots/` |

What it enabled that would have been awkward otherwise: Kiro can ask the same engine the UI asks while it writes a
test or a fixture, so it does not type a payback from memory. `mcp-tools.md` steering tells the agent when to call
each tool and to stop if a tool and a steering file disagree.

How it was verified: `mcp/tools.test.ts` covers the handlers, including a property that a refusal never carries a
verdict and an answer never carries `NaN`. We also drove the real server over stdio with an `initialize` frame and a
`lookup_sponsor` call for Wellesley, and it answered `eligibleForMassSave: false`.

**Setup note.** The config to register it is `mcp/kiro-mcp.json`. Copy its `switchpoint` entry into
`.kiro/settings/mcp.json`. We did not write to `.kiro/settings/` from the build agent because that path is
write-protected in this workspace.

## Property-based testing

fast-check, with the requirement families named in `.kiro/steering/property-testing.md`:

- **P1-P13 (`lib/calc`)**: positivity, monotonicity in fuel and electricity price, rebate caps, payback identity,
  savings-sign versus break-even, the 2027 step-down never paying more, determinism, no `NaN`, totality on hostile
  input, unit round-trip, and the rebate stack summing to its printed total.
- **P13-P16 (`lib/switch/quotes`)**: ranking is order-independent, an implausible quote is never ranked, fees never
  make a price cheaper, a negotiation price always comes from a ranked quote.
- **P17-P21 (`lib/switch/consent`)**: no unknown top-level key, no unknown fact key, no email, no phone number and
  no seventh provider ever gets through the consent gate. Each property asserts the refusal *code*, so a request
  cannot pass by being rejected for an unrelated reason.

### What it catches that examples do not, measured

`node scripts/pbt-mutation-check.mjs` copies `lib/calc` to a temp folder, plants ten realistic bugs one at a time,
and runs the example suites and the property suite against each. The real tree is never touched. Result from the
run on 2026-10-24:

| Mutant | Planted bug | Example suites | Property suite |
| --- | --- | --- | --- |
| M1 | rebate: per-ton cap dropped | killed | killed |
| M2 | rebate: post-bonus cap dropped | killed | killed |
| M3 | rebate: may exceed the install cost | **survived** | killed |
| M4 | savings sign flipped | killed | killed |
| M5 | payback off by one percent | killed | killed |
| M6 | heat pump draws 0.5% too much power | killed | **survived** |
| M7 | cliff verdict fires when the two years pay the same | killed | **survived** |
| M8 | install year swapped: 2027 installs get the 2026 table | killed | **survived** |
| M9 | payback limit boundary moved | killed | **survived** |
| M10 | oversize warning threshold moved | killed | killed |

No mutant survived both. One was caught only by properties (M3, a rebate larger than the install cost, which no
hand-picked example happened to hit). Four were caught only by examples (M6-M9), because a property cannot know a
specific constant, a specific year mapping or a specific boundary. **The two styles are complementary, not
competing**, and that is how we use them: properties for invariants, examples for anchors. We have no recorded real-world counterexample from fast-check during the build, so we report the mutation result
above rather than claim a bug we cannot point to.

## Powers

`power/switchpoint-ma-heat-pump/` is a power we authored: `POWER.md` with keyword activation (heat pump, mass save,
rebate, municipal light plant), the MCP server config, and two steering guides (`verify-a-number`,
`before-december-31`). It packages the idea above for anyone who opens a Massachusetts energy repository in Kiro.
We have not published it, and no third-party powers were installed in the workspace when this was written.

## Build log as process evidence

`BUILDLOG.md` is generated from `@built F-NN` markers in the source and from the rows in the main spec's
`tasks.md`. CI fails if it drifts from the committed file (`scripts/ci-guard.mjs`), if `/.kiro` is gitignored, or if
a key is committed (gitleaks). The log is the honest answer to "what did you actually get done today".

## Limits

- The hooks were migrated late and have not been observed firing across a full session at the time of writing.
- Calling real businesses is off unless a deployment enables it. `voice-agent-rules.md` still reads "proposal, pending review".
- The Kiro Power has been authored and structured to the documented layout; it has not been installed through Kiro's power installer.
