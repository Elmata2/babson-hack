#!/usr/bin/env node
/**
 * @built F-157 mutation check — injects known engine bugs into a scratch copy and records
 * which test style catches each one: the example suites, or the fast-check properties.
 *
 * The question this answers is the one the Kiro write-up is asked about property-based
 * testing: did it catch anything unit tests would have missed? A claim on a slide is
 * cheap. This script plants a bug, runs both suites against it, and prints the result,
 * so the answer is reproducible by anyone who clones the repo.
 *
 *   node scripts/pbt-mutation-check.mjs            run every mutant, print a table
 *   node scripts/pbt-mutation-check.mjs --json     the same, as JSON
 *
 * Safety: the real tree is never modified. `lib/calc` and the two data folders it reads
 * are copied to a temp directory, mutated there, and removed afterwards.
 *
 * Exit code: 0 when every mutant is killed by at least one suite; 1 when one survives
 * both (a real gap in the tests); 2 when the harness itself is broken (the unmutated
 * copy does not pass, or a mutant's search string no longer matches the source).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const JSON_OUT = process.argv.includes('--json')

/** Each mutant is one small, realistic mistake: a dropped cap, a flipped sign, an off-by-one. */
const MUTANTS = [
  {
    id: 'M1',
    name: 'rebate: per-ton cap dropped',
    file: 'lib/calc/rebate.ts',
    from: 'base = Math.min(uncapped, rule.capUsd)',
    to: 'base = uncapped',
  },
  {
    id: 'M2',
    name: 'rebate: post-bonus cap dropped',
    file: 'lib/calc/rebate.ts',
    from: 'let total = Math.min(base + bonuses, rule.capAfterBonusesUsd)',
    to: 'let total = base + bonuses',
  },
  {
    id: 'M3',
    name: 'rebate: may exceed the install cost',
    file: 'lib/calc/rebate.ts',
    from: 'installCost !== undefined && total > installCost',
    to: 'false',
  },
  {
    id: 'M4',
    name: 'savings sign flipped',
    file: 'lib/calc/index.ts',
    from: 'const annualSavings = oldCost - newHp',
    to: 'const annualSavings = newHp - oldCost',
  },
  {
    id: 'M5',
    name: 'payback off by one percent',
    file: 'lib/calc/finance.ts',
    from: 'const years = netCost / annualSavings',
    to: 'const years = netCost / (annualSavings * 0.99)',
  },
  {
    id: 'M6',
    name: 'heat pump draws 0.5% too much power',
    file: 'lib/calc/cost.ts',
    from: 'const kWh = btu / (BTU_PER_KWH * scop)',
    to: 'const kWh = (btu / (BTU_PER_KWH * scop)) * 1.005',
  },
  {
    id: 'M7',
    name: 'cliff verdict fires when the two years pay the same',
    file: 'lib/calc/verdict.ts',
    from: 'result.rebate2026 > result.rebate2027',
    to: 'result.rebate2026 >= result.rebate2027',
  },
  {
    id: 'M8',
    name: 'install year swapped: 2027 installs get the 2026 table',
    file: 'lib/calc/index.ts',
    from: 'upgrade.installYear === 2027 ? r2027 : r2026',
    to: 'upgrade.installYear === 2027 ? r2026 : r2027',
  },
  {
    id: 'M9',
    name: 'payback limit off by one boundary (15 years allowed to fail)',
    file: 'lib/calc/verdict.ts',
    from: 'years > MAX_PAYBACK_YEARS',
    to: 'years >= MAX_PAYBACK_YEARS',
  },
  {
    id: 'M10',
    name: 'oversize warning threshold moved',
    file: 'lib/calc/heat.ts',
    from: 'OVERSIZE_WARN_TONS',
    to: 'OVERSIZE_WARN_TONS + 5',
    firstOnly: false,
  },
]

const PROPERTY_SUITE = 'lib/calc/__tests__/properties.test.ts'
const EXAMPLE_SUITES = [
  'lib/calc/__tests__/anchor.test.ts',
  'lib/calc/__tests__/cash-flow.test.ts',
  'lib/calc/__tests__/r8.test.ts',
]

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'switchpoint-mutation-'))
  cpSync(join(ROOT, 'lib', 'calc'), join(dir, 'lib', 'calc'), { recursive: true })
  cpSync(join(ROOT, 'data', 'rules'), join(dir, 'data', 'rules'), { recursive: true })
  cpSync(join(ROOT, 'data', 'snapshots'), join(dir, 'data', 'snapshots'), { recursive: true })
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(
    join(dir, 'vitest.config.mjs'),
    "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['lib/**/*.test.ts'] } })\n",
  )
  return dir
}

function runSuites(dir, files) {
  const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.config.mjs', ...files], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    timeout: 240_000,
  })
  return { passed: result.status === 0, status: result.status, out: `${result.stdout}\n${result.stderr}` }
}

function applyMutant(dir, mutant) {
  const path = join(dir, mutant.file)
  const original = readFileSync(path, 'utf8')
  if (!original.includes(mutant.from)) return { ok: false, original }
  const mutated = mutant.firstOnly === false ? original.split(mutant.from).join(mutant.to) : original.replace(mutant.from, mutant.to)
  writeFileSync(path, mutated)
  return { ok: true, original }
}

const dir = scratch()
const rows = []
let harnessBroken = false

try {
  // Control: the unmutated copy must pass both styles, or every "killed" below is meaningless.
  const control = runSuites(dir, [PROPERTY_SUITE, ...EXAMPLE_SUITES])
  if (!control.passed) {
    console.error('Control run failed: the unmutated copy does not pass its own tests.\n' + control.out.slice(-1500))
    harnessBroken = true
  } else {
    for (const mutant of MUTANTS) {
      const applied = applyMutant(dir, mutant)
      if (!applied.ok) {
        rows.push({ ...mutant, error: 'search string not found in source; update the mutant' })
        harnessBroken = true
        continue
      }
      const examples = runSuites(dir, EXAMPLE_SUITES)
      const properties = runSuites(dir, [PROPERTY_SUITE])
      writeFileSync(join(dir, mutant.file), applied.original)
      rows.push({
        id: mutant.id,
        name: mutant.name,
        killedByExamples: !examples.passed,
        killedByProperties: !properties.passed,
      })
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (existsSync(dir)) console.error(`warning: could not remove ${dir}`)

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const mark = (value) => (value ? 'killed' : 'survived')
  console.log('| Mutant | Planted bug | Example suites | Property suite |')
  console.log('| --- | --- | --- | --- |')
  for (const row of rows) {
    if (row.error) console.log(`| ${row.id} | ${row.name} | ${row.error} | |`)
    else console.log(`| ${row.id} | ${row.name} | ${mark(row.killedByExamples)} | ${mark(row.killedByProperties)} |`)
  }
  const valid = rows.filter((row) => !row.error)
  const onlyProps = valid.filter((row) => row.killedByProperties && !row.killedByExamples).length
  const onlyExamples = valid.filter((row) => row.killedByExamples && !row.killedByProperties).length
  const neither = valid.filter((row) => !row.killedByExamples && !row.killedByProperties).length
  console.log(
    `\n${valid.length} mutants: ${onlyProps} caught only by properties, ${onlyExamples} caught only by examples, ${neither} survived both.`,
  )
}

if (harnessBroken) process.exit(2)
process.exit(rows.some((row) => !row.killedByExamples && !row.killedByProperties) ? 1 : 0)
