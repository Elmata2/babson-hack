#!/usr/bin/env node
/**
 * Self-test for protect-kiro.mjs. Run: node scripts/hooks/protect-kiro.test.mjs
 * Exits non-zero on the first wrong answer, so `npm run hooks:test` can gate it.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./protect-kiro.mjs', import.meta.url))

const cases = [
  { name: 'unrelated file', input: { path: 'README.md', text: '.kiro\n' }, expect: 0 },
  { name: 'gitignore, harmless line', input: { path: '.gitignore', text: 'dist/\n' }, expect: 0 },
  { name: 'gitignore, safe negation', input: { path: '.gitignore', text: '!.kiro/\n!.kiro/**\n' }, expect: 0 },
  { name: 'gitignore ignores .kiro', input: { path: '.gitignore', text: 'dist/\n.kiro\n' }, expect: 2 },
  { name: 'gitignore ignores .kiro/', input: { path: '/repo/.gitignore', text: '.kiro/\n' }, expect: 2 },
  { name: 'gitignore ignores .kiro/**', input: { path: '.gitignore', newStr: '.kiro/**' }, expect: 2 },
  { name: 'shell echo into gitignore', input: { command: 'echo ".kiro" >> .gitignore' }, expect: 2 },
  { name: 'shell echo of the safe negation', input: { command: 'echo "!.kiro/" >> .gitignore' }, expect: 0 },
  { name: 'shell printf with newline', input: { command: "printf 'a\\n.kiro\\n' >> .gitignore" }, expect: 2 },
]

let failed = 0
for (const c of cases) {
  const run = spawnSync('node', [SCRIPT], { input: JSON.stringify({ tool_input: c.input }), encoding: 'utf8' })
  const ok = run.status === c.expect
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name} (exit ${run.status}, wanted ${c.expect})`)
}
process.exit(failed === 0 ? 0 : 1)
