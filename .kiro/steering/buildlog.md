# Steering — The build log

**Inclusion:** always

If it is not in the log, it did not happen. The log is not a nicety; it is how
four people with eight hours avoid rebuilding each other's work, and how the
judges see a real engineering process instead of a pile of generated code.

## How it works

Three files, one direction of flow:

```
   code marker  ─┐
   manual note  ─┼─▶  .buildlog/events.jsonl  ──▶  BUILDLOG.md
   tasks.md     ─┘        (append-only)              (generated)
```

- `.buildlog/events.jsonl` — machine ledger. One JSON object per line. Append
  only. Never hand-edited.
- `BUILDLOG.md` — generated. Human-readable. Never hand-edited; your edit will
  be overwritten and you will look silly in `git diff`.
- `.kiro/specs/switchpoint/tasks.md` — the registry. Its `| F-NN |` rows are the
  feature list the log counts against.

## Marking a function as built

When a function, route, or component actually works, put the marker in the same
commit:

```ts
/** @built F-14 verdict engine — pure, deterministic, property-tested */
export function computeVerdict(input: VerdictInput): VerdictResult { … }
```

Rules:
- One marker per meaningful unit. Not per file, not per line.
- The marker goes in the commit that makes it true. A marker in a branch nobody
  merged is a lie the log will repeat.
- Re-editing the same file does not create a second event; `file + id` is the
  dedupe key.

## Commands

```bash
node scripts/buildlog.mjs hook                 # sync markers + regenerate (the Kiro hook calls this)
node scripts/buildlog.mjs sync                 # scan markers, append new events
node scripts/buildlog.mjs note "text" --tag ui # log work that leaves no trace in code
node scripts/buildlog.mjs write                # regenerate BUILDLOG.md
node scripts/buildlog.mjs status               # terminal progress, coloured
node scripts/buildlog.mjs watch                # re-sync on every save, for the whole session
```

Tags: `calc api ui map ocr data kiro fix docs demo`.

## Cadence

- **Every ~45 minutes**, run `status` in the terminal. If the bar has not moved,
  something is being polished that should be cut.
- **Before 18:30 freeze**, the log must show every feature the demo touches.
- **At submission**, `BUILDLOG.md` is linked from the README. It is evidence of
  process, and process is a scored criterion ("how you approached AI
  development").

## Kiro hooks

`.kiro/hooks/` wires this up so nobody has to remember:

| Hook | Trigger | Does |
| --- | --- | --- |
| `buildlog-sync` | any edit under `src/`, `lib/`, `app/` | `node scripts/buildlog.mjs hook` |
| `pbt-guard` | edit under `lib/calc/` | asks the agent to run the property suite and fix the engine, not the test |
| `spec-drift` | manual trigger | asks the agent to diff `design.md` against `lib/` and report drift |

If your Kiro version uses a different hook schema than the files in
`.kiro/hooks/`, the CLI commands above are the source of truth — a hook is just
a shortcut to them. Say so in the Kiro write-up rather than pretending the hook
fired.
