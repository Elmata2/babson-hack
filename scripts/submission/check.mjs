#!/usr/bin/env node
/**
 * @built F-53 submission checklist — every row a claim, every claim checked here
 * @built F-54 final review — the build log, the git log and the bar, in one read
 *
 * R12.1, R13.4, R16.3 and R25.3 are all "is the submission what we say it is"
 * requirements, and a checklist that is a markdown file drifts. This script asks the
 * repository instead:
 *
 *   node scripts/submission/check.mjs           # the checklist, exit 1 on a hard fail
 *   node scripts/submission/check.mjs --review  # plus the F-54 read: commits, sync, bar
 *
 * Nothing here writes. The one row a script cannot check — the track chosen on the
 * submission portal — is printed as MANUAL and never counted as a pass.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const REVIEW = process.argv.includes('--review')

const results = []

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options })
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}

function record(name, status, detail) {
  results.push({ name, status, detail })
}

function pass(name, detail) {
  record(name, 'PASS', detail)
}

function fail(name, detail) {
  record(name, 'FAIL', detail)
}

function manual(name, detail) {
  record(name, 'MANUAL', detail)
}

function skip(name, detail) {
  record(name, 'SKIP', detail)
}

// ---- repository --------------------------------------------------------------

const remote = run('git', ['remote', 'get-url', 'origin'])
if (remote.ok) {
  const slug = remote.out.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '')
  const gh = run('gh', ['api', `repos/${slug}`, '--jq', '.visibility'])
  if (gh.ok) {
    if (gh.out.toLowerCase() === 'public') pass('Repository is public (R12.1)', `https://github.com/${slug}`)
    else fail('Repository is public (R12.1)', `visibility is ${gh.out}`)
  } else {
    manual('Repository is public (R12.1)', `could not ask GitHub: ${gh.err.split('\n')[0]}`)
  }
} else {
  fail('Repository has an origin remote', 'git remote get-url origin failed')
}

// ---- Kiro evidence -----------------------------------------------------------

const REQUIREMENTS = join('.kiro', 'specs', 'switchpoint', 'requirements.md')
const DESIGN = join('.kiro', 'specs', 'switchpoint', 'design.md')
const TASKS = join('.kiro', 'specs', 'switchpoint', 'tasks.md')
if (existsSync(join(ROOT, REQUIREMENTS)) && existsSync(join(ROOT, DESIGN)) && existsSync(join(ROOT, TASKS))) {
  pass('Specs are in .kiro/specs/switchpoint (R12.2)', 'requirements, design and tasks are all present')
} else {
  fail('Specs are in .kiro/specs/switchpoint (R12.2)', 'a spec file is missing')
}

const ignoreCheck = run('git', ['check-ignore', '-q', '.kiro'])
if (ignoreCheck.ok) fail('.kiro is not gitignored (R12.1)', 'git check-ignore found a rule')
else pass('.kiro is not gitignored (R12.1)', 'git check-ignore found nothing')

const steering = existsSync(join(ROOT, '.kiro', 'steering'))
const hooks = existsSync(join(ROOT, '.kiro', 'hooks'))
if (steering && hooks) pass('Steering and hooks are committed (R12.3)', '.kiro/steering and .kiro/hooks both present')
else fail('Steering and hooks are committed (R12.3)', 'one of .kiro/steering, .kiro/hooks is missing')

// ---- the README answers the brief -------------------------------------------

if (existsSync(join(ROOT, 'README.md'))) {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const quoted = /Cleaner, more affordable buildings/i.test(readme)
  const datasets = ['MassGIS', 'Census', 'DOER', 'EIA', 'Open-Meteo'].filter((name) => readme.includes(name))
  if (quoted && datasets.length >= 4) {
    pass('README quotes challenge C2 and names the datasets (R16.3)', `${datasets.join(', ')}`)
  } else {
    fail('README quotes challenge C2 and names the datasets (R16.3)', `quoted=${quoted}, datasets=${datasets.length}`)
  }
} else {
  fail('README exists', 'no README.md at the root')
}

// ---- the build log ----------------------------------------------------------

const buildlogPath = join(ROOT, 'BUILDLOG.md')
if (existsSync(buildlogPath)) {
  const buildlog = readFileSync(buildlogPath, 'utf8')
  const match = /Built:\*\* (\d+) \/ (\d+) features/.exec(buildlog)
  if (!match) {
    fail('Build log reports a feature count (R11.2)', 'the "Built: N / M" line is missing')
  } else {
    const [, built, total] = match
    if (built === total) pass('Build log: every registry row is built (R11.2)', `${built} / ${total}`)
    else fail('Build log: every registry row is built (R11.2)', `${built} / ${total}`)
  }
  const drift = run('node', ['scripts/ci-guard.mjs', '--buildlog'])
  if (drift.ok) pass('Build log is not drifted from its markers (R11.4)', 'ci-guard --buildlog is green')
  else fail('Build log is not drifted from its markers (R11.4)', drift.err || drift.out)
} else {
  fail('BUILDLOG.md exists', 'not found')
}

// ---- the demo video ---------------------------------------------------------

const VIDEO = join('public', 'demo', 'switchpoint-demo.mp4')
if (existsSync(join(ROOT, VIDEO))) {
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO])
  const seconds = probe.ok ? Number(probe.out) : Number.NaN
  const megabytes = statSync(join(ROOT, VIDEO)).size / 1_000_000
  if (Number.isFinite(seconds) && seconds < 180 && seconds > 30) {
    pass('Demo video exists and is under three minutes (R13.4, F-52)', `${seconds.toFixed(1)}s, ${megabytes.toFixed(1)} MB, committed at ${VIDEO}`)
  } else {
    fail('Demo video exists and is under three minutes (R13.4, F-52)', `${seconds}s, ${megabytes.toFixed(1)} MB`)
  }
} else {
  fail('Demo video exists (R13.4, F-52)', `${VIDEO} not found — run node scripts/demo/record.mjs`)
}

// ---- the agent and its CI ---------------------------------------------------

if (existsSync(join(ROOT, 'agents', 'quote-caller', 'agent.json')) && existsSync(join(ROOT, 'agents', 'verdict-line', 'agent.json'))) {
  pass('Agents are configuration in the repository (R19, R23)', 'agents/quote-caller and agents/verdict-line')
} else {
  fail('Agents are configuration in the repository (R19, R23)', 'an agent folder is missing')
}

for (const [workflow, label] of [
  ['.github/workflows/ci.yml', 'CI runs checks, build-log drift and the .kiro guard (R25.1–25.3)'],
  ['.github/workflows/agent-sim.yml', 'Agent simulation is gated on agents/** (R25.6, F-135)'],
  ['.github/workflows/agent-sync.yml', 'Agent config is pushed on merge (R25.7, F-136)'],
]) {
  if (existsSync(join(ROOT, workflow))) pass(label, workflow)
  else fail(label, `${workflow} is missing`)
}

// ---- the one row no script can check ---------------------------------------

manual(
  'Track selected on the submission portal (F-53)',
  'Choose "Climate Tech — C2 Cleaner, more affordable buildings" and paste the repository URL. Nothing in the repo can prove it.',
)

// ---- F-54: the final read --------------------------------------------------

function review() {
  const commits = run('git', ['rev-list', '--count', 'HEAD'])
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const sha = run('git', ['rev-parse', '--short', 'HEAD'])
  const log = run('git', ['log', '--oneline', '-12'])
  const fetch = run('git', ['fetch', '--quiet', 'origin'])
  const ahead = run('git', ['rev-list', '--count', 'origin/master..HEAD'])
  const behind = run('git', ['rev-list', '--count', 'HEAD..origin/master'])
  const dirty = run('git', ['status', '--porcelain'])
  const built = run('node', ['scripts/buildlog.mjs', 'status'])

  console.log('\nF-54 — final reading')
  console.log(`  branch      ${branch.out} @ ${sha.out}`)
  console.log(`  commits     ${commits.out}`)
  if (fetch.ok && ahead.ok && behind.ok) {
    console.log(`  vs origin   ahead ${ahead.out}, behind ${behind.out}`)
    if (ahead.out !== '0') fail('Everything is pushed (F-54)', `${ahead.out} commit(s) ahead of origin/master`)
    else if (behind.out !== '0') fail('Everything is pushed (F-54)', `${behind.out} commit(s) behind origin/master — merge before submitting`)
    else pass('Everything is pushed (F-54)', 'master matches origin/master')
  }
  if (dirty.out === '') pass('Working tree is clean (F-54)', 'git status --porcelain is empty')
  else fail('Working tree is clean (F-54)', dirty.out.split('\n').length + ' path(s) dirty')
  if (built.ok) console.log(`  ${built.out.split('\n').slice(-1)[0] ?? ''}`)
  console.log('\n  last commits:')
  for (const line of log.out.split('\n')) console.log(`    ${line}`)
}

// ---- report -----------------------------------------------------------------

const width = Math.max(...results.map((row) => row.name.length))
const icon = { PASS: '✔', FAIL: '✖', MANUAL: '→', SKIP: '·' }
console.log('Switchpoint submission checklist\n')
for (const row of results) {
  console.log(`${icon[row.status]} ${row.name.padEnd(width)}  ${row.detail}`)
}

const failed = results.filter((row) => row.status === 'FAIL')
const manualRows = results.filter((row) => row.status === 'MANUAL')
console.log(`\n${results.length - failed.length - manualRows.length} passed · ${failed.length} failed · ${manualRows.length} manual`)

if (REVIEW) review()

process.exit(failed.length === 0 ? 0 : 1)
