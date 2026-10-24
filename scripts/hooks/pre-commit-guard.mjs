#!/usr/bin/env node
/**
 * @built F-164 PreToolUse pre-commit guard — before any `git commit`, run the /.kiro check CI runs
 *
 * Replaces the manual "pre-commit-guard" prompt hook with one that actually runs. It reads
 * the hook JSON from stdin and does nothing unless the shell command contains `git commit`.
 * For a commit it runs `node scripts/ci-guard.mjs --kiro` (fast, and it cannot be fooled by
 * the generated build log being staged in the very commit it guards). A failure exits 2,
 * which blocks the commit and shows the agent why. A pass prints a one-line reminder that the
 * full gate is `npm run check`; that one is left to the agent because it takes longer than a
 * hook should.
 *
 * Exit 0: not a commit, or the guard passed. Exit 2: the guard failed.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

let payload
try {
  payload = JSON.parse(readStdin())
} catch {
  process.exit(0)
}

const input = payload?.tool_input ?? payload?.toolInput ?? payload?.input ?? {}
const command = String(input.command ?? '')
if (!/\bgit\s+(?:-[^\s]+\s+)*commit\b/.test(command)) process.exit(0)

const guard = spawnSync('node', ['scripts/ci-guard.mjs', '--kiro'], { encoding: 'utf8' })
if (guard.status !== 0) {
  process.stderr.write(`Blocked: the /.kiro guard failed, and CI would fail the same way.\n${guard.stdout}${guard.stderr}`)
  process.exit(2)
}
process.stdout.write('/.kiro guard passed. Run `npm run check` before pushing: CI runs it too.\n')
process.exit(0)
