#!/usr/bin/env node
/**
 * @built F-80 scenario review report: what /verdict actually shows for every scenario
 *
 * Fetches `/verdict` for each scenario's query (`lib/scenarios/queries.json`, kept in
 * step with the bills by the scenario tests) from a running build and writes
 * `docs/scenarios/README.md`: a summary table, then one section per scenario with the
 * bills, the expected outcome from the matrix, and the page text as served. A DIFF
 * marker means the page shows something other than the matrix expects.
 *
 * Usage:
 *   npx next build && npx next start -p 3000
 *   node scripts/scenarios-report.mjs 3000 [--screens]
 *
 * `--screens` also saves a full-page screenshot per scenario with headless Chrome into
 * `docs/scenarios/screens/`. Needs Node 22.18+ (loads the .ts matrix directly).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCENARIOS, heatingReaderJson } from '../lib/scenarios/scenarios.ts'
import { chrome, chromeAvailable } from './demo-bills/chrome.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs/scenarios')
const SCREENS = join(DOCS, 'screens')
const STAGING = mkdtempSync(join(tmpdir(), 'scenarios-report-'))
const STAGED_SCREENS = join(STAGING, 'screens')
const port = process.argv.slice(2).find((arg) => /^\d+$/.test(arg)) ?? '3000'
const BASE = `http://localhost:${port}`
const WITH_SCREENS = process.argv.includes('--screens')
const queries = JSON.parse(readFileSync(join(ROOT, 'lib/scenarios/queries.json'), 'utf8'))

const DIAL_LABEL = {
  SWITCH_NOW: 'Switch now',
  SWITCH_BEFORE_DEC31: 'Before 31 Dec',
  DO_NOT_SWITCH_YET: 'Don’t switch yet',
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ' }
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENTITIES[m])
const clean = (fragment) =>
  decode(fragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?%])/g, '$1')
    .trim()

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
const first = (html, pattern) => {
  const match = pattern.exec(html)
  return match ? clean(match[1]) : null
}

/** The section that follows a heading matching `title`, up to the next h2, as plain text. */
function sectionAfter(html, title) {
  const heading = new RegExp(`<h[123][^>]*>[^<]*${title}[^<]*</h[123]>`, 'i').exec(html)
  if (!heading) return null
  const rest = html.slice(heading.index + heading[0].length)
  const next = /<h2[\s>]/.exec(rest)
  return clean(next ? rest.slice(0, next.index) : rest.slice(0, 2500))
}

function readPage(rawHtml) {
  const html = strip(rawHtml)
  const dial = /<li[^>]*aria-current="true"[^>]*>([\s\S]*?)<\/li>/.exec(html)
  const dialText = dial ? clean(dial[1]).replace(/\s*this house\s*$/i, '').replace(/this house$/i, '').trim() : null
  const headline = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)
  const refusal = /A refusal, not a verdict/.test(html)
  const cannot = /We cannot answer this one honestly/.test(html)
  return {
    headline,
    eyebrow: refusal ? 'A refusal, not a verdict' : null,
    shown: refusal ? 'Refusal (no verdict shown)' : cannot ? 'Refusal (cannot answer)' : dialText,
    tone: first(html, /data-tone="([^"]+)"/),
    action: first(html, /<p[^>]*text-\(--tone\)[^>]*>([\s\S]*?)<\/p>/),
    refusalBody: refusal ? sectionAfter(html, 'do not apply') : null,
    recommendation: first(html, /What to do next<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/),
    money: sectionAfter(html, 'The money'),
    contacts: sectionAfter(html, 'contact'),
    text: clean(html),
  }
}

const expectedLabel = (scenario) =>
  scenario.expected.noMassSave ? 'Refusal (no verdict shown)' : DIAL_LABEL[scenario.expected.verdict]

const cell = (text) => (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const billsRel = (id) => `../../public/demo-bills/scenarios/${id}`

async function fetchPage(url) {
  const response = await fetch(url, { redirect: 'manual' })
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text()
}

function screenshot(id, url) {
  mkdirSync(STAGED_SCREENS, { recursive: true })
  chrome([`--window-size=1200,2800`, '--virtual-time-budget=6000', `--screenshot=${join(STAGED_SCREENS, `${id}.png`)}`, url])
}

const RECOMMENDATION_PREFIX = {
  stay: 'Our recommendation: stay with what you have.',
  quotes: 'Our recommendation: get heat pump quotes now',
}

function failures(scenario, page) {
  const found = []
  const { expected } = scenario
  const wanted =
    expected.recommendation === 'light_plant'
      ? `Mass Save rebates don’t apply in ${scenario.town}: your light plant sets its own programs.`
      : RECOMMENDATION_PREFIX[expected.recommendation]
  if (!page.recommendation?.startsWith(wanted)) found.push(`recommendation should start "${wanted}", page says "${page.recommendation}"`)
  if (expected.noMassSave) {
    if (!page.refusalBody || !/light plant/i.test(page.refusalBody)) found.push('refusal text does not name the municipal light plant')
    if (/January 2027|prices and rebates reset/.test(page.recommendation ?? '')) found.push('light plant recommendation promises a January 2027 recheck')
    if (page.text.includes('We will show what the same heat would cost to run')) found.push('refusal promises a running cost it does not show')
    if (!/At (your light plant’s|the electricity) rate from your bill/.test(page.text)) found.push('refusal shows no running-cost comparison at the bill rate')
  }
  if (expected.flags.includes('negative_cash_flow') && !page.text.includes('HEAT Loan the payment')) {
    found.push('negative cash flow is not stated in the headline reasons')
  }
  return found
}

const rows = []
for (const scenario of SCENARIOS) {
  const query = queries[scenario.id]
  const url = `${BASE}/verdict?${query}`
  try {
    const page = readPage(await fetchPage(url))
    const expected = expectedLabel(scenario)
    const sentenceOk = page.headline !== null && (scenario.expected.noMassSave || new RegExp(scenario.expected.headlinePattern).test(page.headline))
    const problems = failures(scenario, page)
    const ok = page.shown === expected && sentenceOk && problems.length === 0
    if (WITH_SCREENS && chromeAvailable()) screenshot(scenario.id, url)
    rows.push({ scenario, query, page, expected, ok, problems, error: null })
  } catch (error) {
    rows.push({ scenario, query, page: null, expected: expectedLabel(scenario), ok: false, problems: [], error: String(error.message ?? error) })
  }
  console.log(`${rows.at(-1).ok ? 'ok  ' : 'DIFF'} ${scenario.id}`)
}

const diffs = rows.filter((row) => !row.ok)
const out = []
out.push('# Scenario review', '')
out.push(
  `Generated by \`node scripts/scenarios-report.mjs ${port}${WITH_SCREENS ? ' --screens' : ''}\` against a running \`next start\`. Every bill is synthetic and marked SAMPLE.`,
  `Prices come from the baked snapshot (\`demo=1\`), so the numbers do not move with live data.`,
  '',
  `**${rows.length - diffs.length} of ${rows.length} scenarios show what the matrix expects.**${diffs.length ? ` Differences: ${diffs.map((row) => `\`${row.scenario.id}\``).join(', ')}.` : ''}`,
  '',
  'Regenerate the bills with `node scripts/demo-bills/scenarios.mjs`. The matrix is `lib/scenarios/scenarios.ts`; the pipeline tests are `lib/scenarios/__tests__/scenarios.test.ts`.',
  '',
  '| Scenario | Bills | Expected | Shown | Headline | What to do next | Contacts | Match |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
)
for (const row of rows) {
  const { scenario, page } = row
  const hasHeating = heatingReaderJson(scenario) !== null
  const bills = `[electric](${billsRel(scenario.id)}/electric.png)${hasHeating ? ` · [heating](${billsRel(scenario.id)}/heating.png)` : ' · electric is the heat bill'}`
  out.push(
    `| [${cell(scenario.title)}](#${scenario.id}) | ${bills} | ${cell(row.expected)} | ${cell(page?.shown ?? row.error)} | ${cell(page?.headline)} | ${cell(page?.recommendation)} | ${page?.contacts ? 'yes' : 'none shown'} | ${row.ok ? 'ok' : 'DIFF'} |`,
  )
}
out.push('')
for (const row of rows) {
  const { scenario, page } = row
  const hasHeating = heatingReaderJson(scenario) !== null
  out.push(`## ${scenario.title} {#${scenario.id}}`, '')
  out.push(scenario.covers, '')
  out.push(`- Town: ${scenario.town}. Fuel: ${scenario.fuel}. Install year: ${scenario.installYear}. Quote: ${scenario.quote === null ? 'none (Mass Save average)' : `$${scenario.quote.toLocaleString('en-US')}`}.`)
  out.push(`- Electric bill: [PNG](${billsRel(scenario.id)}/electric.png) · [PDF](${billsRel(scenario.id)}/electric.pdf) · [reader JSON](${billsRel(scenario.id)}/expected/electric.json)`)
  out.push(
    hasHeating
      ? `- Heating bill: [PNG](${billsRel(scenario.id)}/heating.png) · [PDF](${billsRel(scenario.id)}/heating.pdf) · [reader JSON](${billsRel(scenario.id)}/expected/heating.json)`
      : '- Heating bill: the electric bill is the heating bill (read once as electricity, once as heat).',
  )
  out.push(`- Verdict link: \`/verdict?${row.query}\``)
  out.push(`- Expected: ${row.expected}, ${scenario.expected.headlineCase}, recommendation \`${scenario.expected.recommendation}\`, choices ${scenario.expected.choices.join(' / ')}.`)
  if (!page) {
    out.push(`- Fetch failed: ${row.error}`, '')
    continue
  }
  out.push(`- Shown: **${page.shown ?? 'no dial'}**${page.action ? `, action "${page.action}"` : ''}${page.tone ? `, tone \`${page.tone}\`` : ''}. Match: ${row.ok ? 'ok' : '**DIFF**'}.`)
  out.push(`- Headline: ${page.headline ?? 'none'}`)
  for (const problem of row.problems) out.push(`- **Check failed:** ${problem}`)
  if (page.refusalBody) out.push(`- Refusal text: ${page.refusalBody}`)
  out.push(`- What to do next: ${page.recommendation ?? 'not found on the page'}`)
  out.push(`- Contacts: ${page.contacts ?? 'no contacts block on the page'}`)
  if (page.money) out.push(`- The money: ${page.money.slice(0, 400)}`)
  if (WITH_SCREENS) out.push('', `![${scenario.id}](screens/${scenario.id}.png)`)
  out.push('')
}

mkdirSync(DOCS, { recursive: true })
const staged = join(STAGING, 'README.md')
writeFileSync(staged, `${out.join('\n')}\n`)
if (diffs.length) {
  console.error(`not overwriting docs/scenarios/README.md; the failed report is at ${staged}`)
  for (const row of diffs) for (const problem of row.problems) console.error(`  ${row.scenario.id}: ${problem}`)
  process.exitCode = 1
} else {
  if (existsSync(STAGED_SCREENS)) cpSync(STAGED_SCREENS, SCREENS, { recursive: true })
  copyFileSync(staged, join(DOCS, 'README.md'))
  rmSync(STAGING, { recursive: true, force: true })
  console.log(`wrote docs/scenarios/README.md (${rows.length}/${rows.length} match)`)
}
