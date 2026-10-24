#!/usr/bin/env node
/** @built F-03 append-only build log + generated BUILDLOG.md (sync/note/write/status/watch) */
/**
 * Switchpoint build log — one source of truth for "what we have actually built".
 *
 *   node scripts/buildlog.mjs sync                 scan @built markers, append events
 *   node scripts/buildlog.mjs note "text" --tag ui log work that leaves no trace in code
 *   node scripts/buildlog.mjs write                regenerate BUILDLOG.md
 *   node scripts/buildlog.mjs hook                 sync + write (what the Kiro hook calls)
 *   node scripts/buildlog.mjs status               terminal progress
 *   node scripts/buildlog.mjs watch                sync + write on every save
 *
 * Design notes:
 *  - Append-only ledger (.buildlog/events.jsonl), generated view (BUILDLOG.md).
 *  - No dependencies. Node >= 20.
 *  - Idempotent: no wall-clock in the generated file, timestamps come from events.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const LOG_DIR = path.join(ROOT, '.buildlog')
const EVENTS_FILE = path.join(LOG_DIR, 'events.jsonl')
const TASKS_FILE = path.join(ROOT, '.kiro', 'specs', 'switchpoint', 'tasks.md')
const OUT_FILE = path.join(ROOT, 'BUILDLOG.md')

const SCAN_DIRS = ['src', 'lib', 'app', 'components', 'data', 'scripts', '.kiro/specs']
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.md'])
const SKIP = new Set(['node_modules', '.next', '.git', '.vercel', 'dist', 'out', '.buildlog'])

const MARKER = /@built\s+(F-\d+)\s+(.{0,120})/g
const TASK_ROW = /^\|\s*(F-\d+)\s*\|\s*(P\d)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/

const TAG_ICON = {
  calc: '🧮', api: '🔌', ui: '🎨', map: '🗺️', ocr: '📄',
  data: '📊', kiro: '🤖', fix: '🔧', docs: '📝', demo: '🎬',
  rules: '📏', blocked: '⛔', ship: '🚀',
}

// ---------------------------------------------------------------- utilities

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '')
}

function commitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return 'nogit'
  }
}

function readEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return []
  return fs.readFileSync(EVENTS_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
}

function appendEvents(events) {
  if (!events.length) return
  ensureLogDir()
  fs.appendFileSync(EVENTS_FILE, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
}

/** Registry of features, parsed from the task table in tasks.md. */
function readRegistry() {
  if (!fs.existsSync(TASKS_FILE)) return []
  const rows = []
  for (const line of fs.readFileSync(TASKS_FILE, 'utf8').split('\n')) {
    const m = line.match(TASK_ROW)
    if (!m) continue
    rows.push({ id: m[1], phase: m[2], title: m[3].trim(), owner: m[4].trim(), est: m[5].trim() })
  }
  return rows
}

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.kiro') continue
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (SCAN_EXT.has(path.extname(e.name))) out.push(full)
  }
  return out
}

function phaseOf(registry, id) {
  return registry.find((r) => r.id === id)?.phase ?? 'P?'
}

// ------------------------------------------------------------------- commands

function sync({ quiet = false } = {}) {
  const registry = readRegistry()
  const events = readEvents()
  const seen = new Set(events.filter((e) => e.source === 'marker').map((e) => `${e.id}|${e.file}`))
  const fresh = []
  const now = new Date().toISOString()
  const sha = commitSha()

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file)
      let text
      try { text = fs.readFileSync(file, 'utf8') } catch { continue }
      if (!text.includes('@built')) continue
      for (const m of text.matchAll(MARKER)) {
        const id = m[1]
        const key = `${id}|${rel}`
        if (seen.has(key)) continue
        seen.add(key)
        fresh.push({
          id,
          phase: phaseOf(registry, id),
          title: registry.find((r) => r.id === id)?.title ?? m[2].trim(),
          file: rel,
          ts: now,
          commit: sha,
          source: 'marker',
          text: m[2].trim() || null,
        })
      }
    }
  }

  appendEvents(fresh)
  if (!quiet) {
    if (fresh.length) console.log(c.green(`+ ${fresh.length} feature(s) logged`))
    else console.log(c.dim('no new markers'))
    for (const f of fresh) console.log(`  ${c.green('✔')} ${f.id} ${c.dim(f.title)} ${c.dim(f.file)}`)
  }
  return fresh
}

function note(text, tag = 'data') {
  if (!text) {
    console.error('usage: buildlog note "what you did" [--tag ui]')
    process.exit(1)
  }
  const registry = readRegistry()
  const id = (text.match(/F-\d+/) || [null])[0]
  appendEvents([{
    id: id ?? 'NOTE',
    phase: id ? phaseOf(registry, id) : 'NOTE',
    title: text,
    file: null,
    ts: new Date().toISOString(),
    commit: commitSha(),
    source: 'manual',
    tag,
    text,
  }])
  console.log(c.green(`+ noted`) + ` ${c.dim(tag)} ${text}`)
}

// ------------------------------------------------------------------ rendering

function bar(built, total, width = 18) {
  if (!total) return '░'.repeat(width)
  const n = Math.round((built / total) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function pct(built, total) {
  return total ? `${Math.round((built / total) * 100)}%` : '—'
}

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
  })
}

function render() {
  const registry = readRegistry()
  const events = readEvents()
  const builtIds = new Set(events.filter((e) => /^F-\d+$/.test(e.id)).map((e) => e.id))
  const asOf = events.length ? events[events.length - 1].ts : null
  const sha = commitSha()

  const total = registry.length
  const built = registry.filter((r) => builtIds.has(r.id)).length
  const phases = [...new Set(registry.map((r) => r.phase))].sort()

  const L = []
  L.push('# Build log — Switchpoint')
  L.push('')
  L.push(`> Massachusetts heat-pump verdict engine · Climate Tech, challenge C2 ·`
    + ` Hackachusetts 2026, Babson hub.`)
  L.push('>')
  L.push('> This file is generated by `scripts/buildlog.mjs` from `@built F-NN` markers in the')
  L.push('> source and `.buildlog/events.jsonl`. It is never hand-edited. Do not edit it by hand.')
  L.push('')
  L.push(`**Built:** ${built} / ${total} features · ${bar(built, total, 28)} **${pct(built, total)}**`)
  L.push('')
  L.push(`**Last event:** ${asOf ? `${asOf} (${hhmm(asOf)} ET)` : '—'} · **commit:** \`${sha}\``)
  L.push('')

  // Now
  L.push('## Now')
  L.push('')
  const last = events.slice(-3).reverse()
  if (!last.length) L.push('_Nothing logged yet. Run `node scripts/buildlog.mjs sync`._')
  for (const e of last) {
    const icon = e.source === 'manual' ? (TAG_ICON[e.tag] ?? '•') : '✔'
    L.push(`- \`${hhmm(e.ts)}\` ${icon} **${e.id}** ${e.title ?? ''}${e.file ? ` · \`${e.file}\`` : ''}`)
  }
  L.push('')

  // Next up
  L.push('## Next up')
  L.push('')
  const next = registry.filter((r) => !builtIds.has(r.id)).slice(0, 5)
  if (!next.length) L.push('_Every feature in the spec is logged._')
  for (const r of next) {
    L.push(`- [ ] **${r.id}** · ${r.title} \`${r.phase}\`${r.owner ? ` · ${r.owner}` : ''}${r.est ? ` · ${r.est}` : ''}`)
  }
  L.push('')

  // Phases
  L.push('## Phases')
  L.push('')
  L.push('| Phase | Built | Progress | |')
  L.push('| --- | --- | --- | --- |')
  for (const p of phases) {
    const rows = registry.filter((r) => r.phase === p)
    const b = rows.filter((r) => builtIds.has(r.id)).length
    L.push(`| **${p}** | ${b}/${rows.length} | \`${bar(b, rows.length)}\` | ${pct(b, rows.length)} |`)
  }
  L.push('')

  // Timeline
  L.push('## Timeline')
  L.push('')
  if (!events.length) L.push('_Empty._')
  for (const e of [...events].reverse()) {
    const icon = e.source === 'manual' ? (TAG_ICON[e.tag] ?? '•') : '✔'
    const file = e.file ? ` · \`${e.file}\`` : ''
    const commit = e.commit && e.commit !== 'nogit' ? ` · \`${e.commit}\`` : ''
    L.push(`- \`${hhmm(e.ts)}\` ${icon} **${e.id}** — ${e.title ?? ''}${file}${commit}`)
  }
  L.push('')
  L.push('---')
  L.push('')
  L.push('Generated view. The ledger is `.buildlog/events.jsonl`; the registry is')
  L.push('`.kiro/specs/switchpoint/tasks.md`. Regenerate with `node scripts/buildlog.mjs hook`.')
  L.push('')

  return L.join('\n')
}

function write() {
  const md = render()
  fs.writeFileSync(OUT_FILE, md)
  const built = readRegistry().length
  console.log(c.green('✔ BUILDLOG.md written') + c.dim(` (${built} features in registry)`))
}

function status() {
  const registry = readRegistry()
  const events = readEvents()
  const builtIds = new Set(events.filter((e) => /^F-\d+$/.test(e.id)).map((e) => e.id))
  const phases = [...new Set(registry.map((r) => r.phase))].sort()

  console.log('')
  console.log(c.bold('  SWITCHPOINT · BUILD STATUS'))
  console.log(c.dim(`  ${registry.filter((r) => builtIds.has(r.id)).length}/${registry.length} features · commit ${commitSha()}`))
  console.log('')
  for (const p of phases) {
    const rows = registry.filter((r) => r.phase === p)
    const b = rows.filter((r) => builtIds.has(r.id)).length
    const done = b === rows.length && rows.length > 0
    const line = `  ${p}  ${bar(b, rows.length, 22)}  ${String(b).padStart(2)}/${String(rows.length).padEnd(2)} ${pct(b, rows.length).padStart(4)}`
    console.log(done ? c.green(line) : b ? c.yellow(line) : c.dim(line))
  }
  console.log('')
  const next = registry.filter((r) => !builtIds.has(r.id)).slice(0, 3)
  if (next.length) {
    console.log(c.dim('  next:'))
    for (const r of next) console.log(`    ${c.cyan(r.id)} ${r.title}`)
  } else {
    console.log(c.green('  all features logged — freeze and rehearse'))
  }
  console.log('')
}

// ----------------------------------------------------------------------- main

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'sync':
    sync()
    break
  case 'note': {
    const tagIdx = rest.indexOf('--tag')
    const tag = tagIdx >= 0 ? rest[tagIdx + 1] : 'data'
    const text = rest.filter((_, i) => tagIdx < 0 || (i !== tagIdx && i !== tagIdx + 1)).join(' ')
    note(text, tag)
    break
  }
  case 'write':
    write()
    break
  case 'hook':
    sync()
    write()
    break
  case 'status':
    status()
    break
  case 'watch': {
    write()
    console.log(c.dim('watching for changes… ctrl-c to stop'))
    let timer = null
    try {
      fs.watch(ROOT, { recursive: true }, (_evt, file) => {
        if (!file) return
        if (file.startsWith('.buildlog') || file === 'BUILDLOG.md') return
        if (file.split(path.sep).some((p) => SKIP.has(p))) return
        clearTimeout(timer)
        timer = setTimeout(() => { sync(); write() }, 400)
      })
    } catch (err) {
      console.error('watch unsupported here:', err.message)
      process.exit(1)
    }
    break
  }
  default:
    console.log(`
${c.bold('switchpoint build log')}

  node scripts/buildlog.mjs sync                 scan @built markers → ledger
  node scripts/buildlog.mjs note "text" --tag ui  log a manual event
  node scripts/buildlog.mjs write                regenerate BUILDLOG.md
  node scripts/buildlog.mjs hook                 sync + write
  node scripts/buildlog.mjs status               terminal progress
  node scripts/buildlog.mjs watch                live mode
`)
}
