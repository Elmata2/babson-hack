#!/usr/bin/env node
/**
 * @built F-81 sample-bill eval: post every sample bill to /api/parse-bill and diff against expected
 *
 * Usage: npm run dev   (with ANTHROPIC_API_KEY set), then
 *        node scripts/demo-bills/eval.mjs [--base http://localhost:3000] [--only g,h]
 *
 * Checks what the model reads (fuel, document type, date, rate class, price). The
 * annual figure and its method are printed next to what the manifest expects, for
 * a human to judge: those depend on form fields and county data, not on reading.
 * Exit code 1 when any check fails. Zero dependencies.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'public/demo-bills')
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : null
}
const BASE = arg('--base') ?? 'http://localhost:3000'
const ONLY = arg('--only')?.split(',') ?? null
const MIME = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' }

const { bills } = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))
let failures = 0

for (const bill of bills) {
  if (ONLY && !ONLY.some((p) => bill.id.startsWith(p))) continue
  const expected = JSON.parse(readFileSync(join(DIR, bill.expected), 'utf8'))
  const file = bill.files.image
  const form = new FormData()
  form.append('file', new Blob([readFileSync(join(DIR, file))], { type: MIME[file.split('.').pop()] }), file)
  for (const [k, v] of Object.entries(bill.form ?? {})) form.append(k, v)

  const started = Date.now()
  let body
  try {
    const res = await fetch(`${BASE}/api/parse-bill`, { method: 'POST', body: form })
    const text = await res.text()
    try {
      body = JSON.parse(text)
    } catch {
      console.log(`✗ ${bill.id}: HTTP ${res.status}, not JSON — ${text.slice(0, 80)}`)
      failures++
      continue
    }
  } catch (error) {
    console.log(`✗ ${bill.id}: request failed — ${error.message}. Is the dev server running at ${BASE}?`)
    failures++
    continue
  }
  const ms = Date.now() - started
  if (body.code === 'vision_not_configured') {
    console.log(`Bill reading is off on ${BASE}: set ANTHROPIC_API_KEY in .env.local and restart the dev server.`)
    process.exit(2)
  }

  const checks = []
  if (expected.error === 'not_a_bill') {
    const refused = body.ok === false && body.code === 'not_a_bill'
    checks.push(['refused as not_a_bill', refused, JSON.stringify(body).slice(0, 80)])
  } else if (!body.ok) {
    checks.push(['ok response', false, `${body.code}: ${body.message}`])
  } else {
    const b = body.bill?.bill ?? body.bill
    const near = (a, e) => a !== null && a !== undefined && Math.abs(a - e) <= Math.abs(e) * 0.01
    checks.push(['fuel', b.fuel === expected.fuel, b.fuel])
    checks.push(['documentType', b.documentType === expected.document_type, b.documentType])
    checks.push(['documentDate', b.documentDate === expected.document_date, b.documentDate])
    checks.push(['rateClass', (b.rateClass ?? null) === expected.rate_class, b.rateClass])
    checks.push(['price', near(b.price?.value, expected.price_per_unit), b.price?.value])
    const annual = b.annualisation ? `${Math.round(b.annualisation.value)} via ${b.annualisation.method}` : `units ${b.units?.value}`
    const flags = (b.flags ?? []).map((f) => f.code).join(', ') || 'none'
    checks.push(['annual (manual)', null, `${annual} · flags: ${flags} · expect: ${bill.expect}`])
  }

  const failed = checks.filter(([, pass]) => pass === false)
  failures += failed.length ? 1 : 0
  console.log(`${failed.length ? '✗' : '✓'} ${bill.id}  (${(ms / 1000).toFixed(1)}s)`)
  for (const [name, pass, got] of checks) console.log(`    ${pass === null ? '·' : pass ? '✓' : '✗'} ${name.padEnd(16)} ${got}`)
}

console.log(failures ? `\n${failures} bill(s) failed.` : '\nAll bills read as expected.')
process.exit(failures ? 1 : 0)
