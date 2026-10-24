#!/usr/bin/env node
/**
 * @built F-132 build-log drift + /.kiro submission guard, the local twin of CI
 * @built F-133 gitleaks secret scan gate lives in `.gitleaks.toml` and `.github/workflows/ci.yml`
 *
 * The two CI gates that are not just `npm run check`, runnable on a laptop so a
 * red build is found before the push rather than after it:
 *
 *   node scripts/ci-guard.mjs             both guards (what `npm run guard` runs)
 *   node scripts/ci-guard.mjs --buildlog  R25.2 — BUILDLOG.md matches the @built markers
 *   node scripts/ci-guard.mjs --kiro      R25.3 — /.kiro is committed and not gitignored
 *
 * Node stdlib only. No dependencies, no network, no YAML parser — the same
 * reason the workflow installs gitleaks from a release tarball instead of an
 * action that wants a paid token: a gate you cannot run locally is a gate you
 * find out about too late.
 *
 * Why the drift check does not use `git diff --exit-code` on BUILDLOG.md:
 * the generated header carries the HEAD sha at generation time
 * ("**Last event:** … · **commit:** `abc1234`"). A BUILDLOG.md regenerated
 * before the commit that ships it can therefore never match that commit, and the
 * check would be permanently red. The comparison normalises that single token
 * and keeps every other line exact — feature counts, the "Now" list, the whole
 * timeline.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const BUILDLOG = 'BUILDLOG.md'
const REQUIREMENTS = '.kiro/specs/switchpoint/requirements.md'

const noColor = process.env.NO_COLOR != null || process.env.TERM === 'dumb'
const paint = (code) => (s) => (noColor ? s : `\x1b[${code}m${s}\x1b[0m`)
const dim = paint(2)
const green = paint(32)
const red = paint(31)
const bold = paint(1)

// ---------------------------------------------------------------- shell glue

function git(args, opts = {}) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts })
}

function node(script, args = []) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

function insideWorkTree() {
  const res = git(['rev-parse', '--is-inside-work-tree'])
  return res.status === 0 && res.stdout.trim() === 'true'
}

/** One line of the file as committed at HEAD, or null when untracked. */
function committedFile(rel) {
  const res = git(['show', `HEAD:${rel}`])
  return res.status === 0 ? res.stdout : null
}

/**
 * Overwrite the volatile header sha so a file generated one commit ago matches
 * the commit that ships it. Nothing else about the file is relaxed.
 */
function normalise(text) {
  return text.replace(/(\*\*commit:\*\*\s*)`[^`]*`/g, '$1`<sha>`')
}

/** A real diff of two strings, via git, so large reorderings stay readable. */
function diffStrings(left, right) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'switchpoint-ci-guard-'))
  try {
    const a = path.join(tmp, 'committed.md')
    const b = path.join(tmp, 'generated.md')
    fs.writeFileSync(a, left)
    fs.writeFileSync(b, right)
    const res = git(['--no-pager', 'diff', '--no-index', '--no-color', '--unified=3', a, b])
    return (res.stdout || '').trim()
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------------- results

const results = []

function pass(label, detail) {
  results.push({ ok: true, label, detail })
}

function fail(label, detail) {
  results.push({ ok: false, label, detail })
}

// ------------------------------------------------------- R25.2 build-log drift

function checkBuildlog() {
  const label = 'build-log drift — BUILDLOG.md matches the @built markers'

  // A hand edit never reaches the content comparison below, because the
  // regeneration overwrites it first. Catch it before regenerating.
  const dirty = git(['status', '--porcelain', '--', BUILDLOG])
  if (dirty.status === 0 && dirty.stdout.trim()) {
    fail(label, [
      'BUILDLOG.md has uncommitted changes. It is generated, so an edit to it is',
      'either a marker that was never logged or a change a human made by hand;',
      'neither belongs in the diff.',
      '',
      '  fix: node scripts/buildlog.mjs hook && git add BUILDLOG.md .buildlog/events.jsonl',
      '       (or `git checkout -- BUILDLOG.md` to discard the hand edit)',
    ].join('\n'))
    return
  }

  const regenerated = node('scripts/buildlog.mjs', ['hook'])
  if (regenerated.status !== 0) {
    fail(label, [
      '`node scripts/buildlog.mjs hook` itself failed, so the drift cannot be judged:',
      (regenerated.stderr || regenerated.stdout || '').trim(),
    ].filter(Boolean).join('\n'))
    return
  }

  let onDisk
  try {
    onDisk = fs.readFileSync(path.join(ROOT, BUILDLOG), 'utf8')
  } catch {
    fail(label, `${BUILDLOG} is missing. Run: node scripts/buildlog.mjs hook`)
    return
  }

  const committed = committedFile(BUILDLOG)
  if (committed == null) {
    fail(label, [
      `${BUILDLOG} is not tracked by git — the drift check needs a committed copy.`,
      '',
      '  fix: node scripts/buildlog.mjs hook',
      '       git add BUILDLOG.md .buildlog/events.jsonl',
    ].join('\n'))
    return
  }

  const left = normalise(committed)
  const right = normalise(onDisk)
  if (left === right) {
    pass(label, 'regenerated copy is identical (header sha ignored)')
    return
  }

  const diff = diffStrings(left, right)
  fail(label, [
    'BUILDLOG.md is out of date with the source. A file that is generated but stale',
    'is a claim the repository can no longer back up.',
    '',
    '  fix: node scripts/buildlog.mjs hook',
    '       git add BUILDLOG.md .buildlog/events.jsonl',
    '',
    diff || '(diff unavailable)',
  ].join('\n'))
}

// ----------------------------------------------------- R25.3 /.kiro submission

function checkKiro() {
  const label = 'submission guard — /.kiro is committed and not gitignored'

  const requirements = path.join(ROOT, REQUIREMENTS)
  if (!fs.existsSync(requirements)) {
    fail(label, [
      `${REQUIREMENTS} does not exist. The submission depends on it (R12.1).`,
      '',
      '  fix: restore the spec directory — it is evidence, not scratch.',
    ].join('\n'))
    return
  }

  // `--no-index` is the whole point. `git check-ignore .kiro` consults the
  // index, so once the directory is committed it reports "not ignored" even
  // when a `.kiro/` line sits in .gitignore — a false pass in exactly the case
  // this guard exists for. `--no-index` judges the rule, not the tracking.
  const ignored = git(['check-ignore', '-q', '--no-index', '.kiro'])
  if (ignored.status === 0) {
    const rule = git(['check-ignore', '-v', '--no-index', '.kiro'])
    fail(label, [
      '/.kiro is gitignored. The hackathon rules disqualify a submission whose',
      '/.kiro directory is not in the repository (R12.1).',
      '',
      `  matched by: ${(rule.stdout || '(unknown rule)').trim()}`,
      '  fix: remove the .kiro line from .gitignore, then:',
      '       git add -f .kiro && git commit -m "fix(kiro): stop ignoring the spec"',
    ].join('\n'))
    return
  }
  if (ignored.status !== 1) {
    fail(label, [
      '`git check-ignore --no-index .kiro` could not answer (git is missing, or',
      '.kiro is not a git repository). The guard cannot certify what it cannot',
      'inspect.',
      '',
      `  git said: ${(ignored.stderr || '').trim() || `exit ${ignored.status}`}`,
    ].join('\n'))
    return
  }

  const tracked = git(['ls-files', '--error-unmatch', REQUIREMENTS], { stdio: 'ignore' })
  if (tracked.status !== 0) {
    fail(label, [
      `${REQUIREMENTS} exists but is not committed — it is ignored or never staged.`,
      '',
      '  fix: git add .kiro && git commit -m "docs(kiro): commit the spec"',
    ].join('\n'))
    return
  }

  pass(label, 'present, tracked, and not ignored')
}

// ----------------------------------------------------------------------- main

const USAGE = `
${bold('switchpoint CI guard')}

  node scripts/ci-guard.mjs              both guards (npm run guard)
  node scripts/ci-guard.mjs --buildlog   R25.2 — BUILDLOG.md matches the @built markers
  node scripts/ci-guard.mjs --kiro       R25.3 — /.kiro is committed and not gitignored
`

const flags = process.argv.slice(2)
const known = new Set(['--buildlog', '--kiro', '--help', '-h'])
const unknown = flags.filter((f) => !known.has(f))
if (unknown.length) {
  console.error(red(`unknown option: ${unknown.join(' ')}`))
  console.error(USAGE)
  process.exit(2)
}
if (flags.includes('--help') || flags.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const all = flags.length === 0
const wanted = {
  buildlog: all || flags.includes('--buildlog'),
  kiro: all || flags.includes('--kiro'),
}

console.log('')
console.log(bold('  CI GUARD · switchpoint'))

if (!insideWorkTree()) {
  console.error(red('  not inside a git work tree — the guards compare committed files.'))
  process.exit(1)
}

if (wanted.buildlog) checkBuildlog()
if (wanted.kiro) checkKiro()

for (const r of results) {
  const mark = r.ok ? green('✔') : red('✖')
  console.log('')
  console.log(`  ${mark} ${r.label}`)
  if (!r.detail) continue
  for (const line of r.detail.split('\n')) console.log(`    ${dim(line)}`)
}

const failed = results.filter((r) => !r.ok)
console.log('')
if (failed.length) {
  console.log(red(`  ${failed.length} guard(s) failed.`) + dim(' CI will run the same checks.'))
  console.log('')
  process.exit(1)
}
console.log(green(`  ${results.length} guard(s) passed.`))
console.log('')
