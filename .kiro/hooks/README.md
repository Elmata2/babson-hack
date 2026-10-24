# Kiro hooks

Three hooks, one purpose each:

| File | Fires on | Does |
| --- | --- | --- |
| `buildlog-sync.json` | any source edit | `node scripts/buildlog.mjs hook` |
| `pbt-guard.json` | edit under `lib/calc/` | asks the agent to run the property suite and fix the engine, not the test |
| `spec-drift.json` | manual | asks the agent to diff the spec against the code and list gaps |

**Schema caveat, stated honestly.** Kiro's hook file format has moved between
releases (`when.type` / `then.type` values, pattern globs). If a hook does not
fire on your install, the command in it is still correct — run it by hand or from
`package.json`:

```bash
npm run log      # sync + write
npm run status   # progress
npm run watch:log
```

Say "the hook calls the same command we run by hand" in the write-up. Never claim
a hook fired when it did not; judges read repos.
