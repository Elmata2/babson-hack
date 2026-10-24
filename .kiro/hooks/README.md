# Kiro hooks

Ten hooks in the v1 format (`{ "version": "v1", "hooks": [ ... ] }`, PascalCase triggers,
`command` or `agent` actions). Hooks load at session start.

| File | Trigger | Action | Does |
| --- | --- | --- | --- |
| `buildlog-sync.json` | `PostFileSave` under `lib/`, `app/`, `components/`, `agents/`, `mcp/` | command | `node scripts/buildlog.mjs hook` |
| `pbt-guard.json` | `PostFileSave` under `lib/calc/` (not tests) | agent | Run the property suite; fix the engine, never weaken the property |
| `rules-regression.json` | `PostFileSave` of `data/rules/*.json` | command | `npx vitest run lib/calc mcp` |
| `scenario-check.json` | `PostFileSave` under `lib/verdict`, `lib/calc`, `lib/switch`, `data/rules` | agent | Run `npx vitest run lib/scenarios` and, if a server is up, `scripts/scenarios-report.mjs`; report any scenario that no longer matches |
| `steering-guard.json` | `PostFileSave` of `data/rules/*.json` or `.kiro/steering/*.md` | agent | Each changed figure needs a source URL and read date; rules and steering must agree |
| `protect-kiro-dir.json` | `PreToolUse` on write tools and shell | command | `scripts/hooks/protect-kiro.mjs`; exit 2 blocks a write that would gitignore `/.kiro` |
| `pre-commit-guard.json` | `PreToolUse` on shell | command | `scripts/hooks/pre-commit-guard.mjs`; on `git commit` runs `node scripts/ci-guard.mjs --kiro`, exit 2 blocks |
| `task-quality-gate.json` | `PostTaskExec` | command | `npm run check` |
| `spec-drift.json` | `PostTaskExec` | agent | Diff the code against the spec and list gaps, largest first |
| `session-status.json` | `SessionStart` | command | `node scripts/buildlog.mjs status` |

The scripts behind the hooks are ordinary commands, so none of them depends on a hook firing:

```bash
npm run log          # sync + write the build log
npm run status       # progress per phase
npm run guard        # node scripts/ci-guard.mjs
npm run check        # tsc + eslint + vitest
npm run hooks:test   # the .kiro guard's self-test
npx vitest run lib/scenarios
```

CI runs the same checks (`.github/workflows/ci.yml`), including the `/.kiro` guard.

The first six hooks in this folder were written in an older schema (`when` / `then`). They were
rewritten to v1 on 2026-10-24, and `pre-commit-guard` went from a manual prompt to a command that
runs. We have not yet observed any hook firing inside Kiro, so none is claimed to have.
Never claim a hook fired when it did not; judges read repos.
