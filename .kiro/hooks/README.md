# Kiro hooks

Seven hooks in the v1 format (`{ "version": "v1", "hooks": [ ... ] }`, PascalCase triggers,
`command` or `agent` actions). Hooks load at session start.

| File | Trigger | Action | Does |
| --- | --- | --- | --- |
| `buildlog-sync.json` | `PostFileSave` under `lib/`, `app/`, `components/`, `agents/`, `mcp/` | command | `node scripts/buildlog.mjs hook` |
| `pbt-guard.json` | `PostFileSave` under `lib/calc/` (not tests) | agent | Run the property suite; fix the engine, never weaken the property |
| `rules-regression.json` | `PostFileSave` of `data/rules/*.json` | command | `npx vitest run lib/calc mcp` |
| `protect-kiro-dir.json` | `PreToolUse` on write tools and shell | command | `scripts/hooks/protect-kiro.mjs`; exit 2 blocks a write that would gitignore `/.kiro` |
| `task-quality-gate.json` | `PostTaskExec` | command | `npm run check` |
| `spec-drift.json` | `PostTaskExec` | agent | Diff the code against the spec and list gaps, largest first |
| `session-status.json` | `SessionStart` | command | `node scripts/buildlog.mjs status` |

The scripts behind the hooks are ordinary commands, so none of them depends on a hook firing:

```bash
npm run log          # sync + write the build log
npm run status       # progress per phase
npm run check        # typecheck, lint, tests
npm run hooks:test   # the .kiro guard's self-test
```

CI runs the same checks (`.github/workflows/ci.yml`), including the `/.kiro` guard.

Earlier versions of these files used an older schema (`when` / `then`). They were rewritten
to v1 on 2026-10-24. Never claim a hook fired unless you saw it; judges read repos.
