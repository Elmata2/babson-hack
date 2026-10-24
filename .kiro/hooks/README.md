# Kiro hooks

Six hooks, one purpose each:

| File | Fires on | Does |
| --- | --- | --- |
| `buildlog-sync.json` | any source edit | `node scripts/buildlog.mjs hook` |
| `pbt-guard.json` | edit under `lib/calc/` | asks the agent to run the property suite and fix the engine, not the test |
| `spec-drift.json` | manual | asks the agent to diff the spec against the code and list gaps |
| `scenario-check.json` | save under `lib/verdict`, `lib/calc`, `lib/switch`, `data/rules` | asks the agent to run `npx vitest run lib/scenarios` and `scripts/scenarios-report.mjs` and report any scenario that no longer matches |
| `steering-guard.json` | save under `data/rules`, `.kiro/steering` | asks the agent to check each changed figure has a source URL and read date, and that `data/rules` and steering agree |
| `pre-commit-guard.json` | manual | asks the agent to run `node scripts/ci-guard.mjs` and `npm run check` |

All six hooks use one format: `name`, `version`, `when` (`fileEdited` with
`patterns`, or `userTriggered`) and `then` (`askAgent`, or `runCommand` for the
build log). We have not seen them fire inside Kiro, so none is claimed to have.

If a hook does not fire on your install, the command in it is still correct. Run it
by hand or from `package.json`:

```bash
npm run log      # sync + write
npm run status   # progress
npm run guard    # node scripts/ci-guard.mjs
npm run check    # tsc + eslint + vitest
npx vitest run lib/scenarios
```

Never claim a hook fired when it did not; judges read repos.
