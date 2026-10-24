#!/usr/bin/env node
/**
 * @built F-80 scenario bills: an electric bill and a heating bill for every scenario in the matrix
 *
 * Reads `lib/scenarios/scenarios.ts` (the same list the tests run) and renders each
 * scenario into `public/demo-bills/scenarios/<id>/`:
 *   electric.{html,png,pdf}   expected/electric.json
 *   heating.{html,png,pdf}    expected/heating.json   (absent when the electric bill is the heating bill)
 * plus `public/demo-bills/scenarios/manifest.json`. The expected JSON is the exact object
 * the reader returns for that bill, built by `electricReaderJson` / `heatingReaderJson`.
 *
 * Every document is marked SAMPLE — NOT A REAL BILL by the shared templates.
 *
 * Usage: node scripts/demo-bills/scenarios.mjs [--html-only] [--only <id>]
 * Needs Node 22.18+ (loads the .ts matrix directly) and Google Chrome for PNG/PDF.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SCENARIOS,
  electricReaderJson,
  electricTotals,
  heatingReaderJson,
} from '../../lib/scenarios/scenarios.ts'
import { chromeAvailable, renderBillFiles } from './chrome.mjs'
import { electricBill, gasBill, oilTicket } from './templates.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, 'public/demo-bills/scenarios')
const HTML_ONLY = process.argv.includes('--html-only')
const onlyIndex = process.argv.indexOf('--only')
const ONLY = onlyIndex === -1 ? null : process.argv[onlyIndex + 1]

const RATE_LABEL = { 'R-1': 'R-1 Residential', 'R-2': 'R-2 Res Assistance' }
const GAS_RATE_LABEL = { 'R-3': 'R-3 Residential Heating', 'R-4': 'R-4 Heating Assistance' }

function electricHtml(s) {
  const e = s.electric
  return electricBill({
    title: `Sample electric bill: ${s.title}`,
    utility: e.utilityName,
    town: s.town,
    zip: s.zip,
    date: e.date,
    days: e.days,
    kWh: electricTotals(e).kWh,
    allInRate: e.allInRate,
    supplyRate: e.supplyRate,
    supplier: e.supplier,
    supplierContact: e.supplierContact,
    supplyNote: e.supplyNote,
    rateLabel: RATE_LABEL[e.rateClass],
    assistance: e.assistance,
    history: e.history,
  })
}

function heatingHtml(s) {
  const h = s.heating
  if (h.kind === 'electric') return null
  if (h.kind === 'gas') {
    return gasBill({
      title: `Sample gas bill: ${s.title}`,
      utility: h.utilityName,
      town: s.town,
      zip: s.zip,
      date: h.date,
      days: h.days,
      therms: h.therms,
      allInRate: h.allInRate,
      supplyRate: h.supplyRate,
      rateLabel: GAS_RATE_LABEL[h.rateClass],
      assistance: h.assistance,
    })
  }
  return oilTicket({
    title: `Sample ${h.kind} ticket: ${s.title}`,
    dealer: h.dealer,
    dealerTown: h.dealerTown,
    ticketNo: h.ticketNo,
    town: s.town,
    zip: s.zip,
    date: h.date,
    gallons: h.gallons,
    pricePerGal: h.pricePerGal,
    tankGal: h.tankGal,
    degreeDays: h.degreeDays,
    lastDelivery: h.lastDelivery,
    terms: 'Automatic delivery, payment due on receipt.',
    ...(h.kind === 'propane' ? { product: 'Propane (LPG)', line: 'Propane · Heating Service' } : {}),
  })
}

const canRender = !HTML_ONLY && chromeAvailable()
if (!HTML_ONLY && !canRender) console.warn('Chrome not found; writing HTML and JSON only. Set CHROME=…')

const manifest = []
for (const scenario of SCENARIOS) {
  if (ONLY && scenario.id !== ONLY) continue
  const dir = join(OUT, scenario.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'expected'), { recursive: true })

  const documents = [{ name: 'electric', html: electricHtml(scenario), json: electricReaderJson(scenario) }]
  const heating = heatingHtml(scenario)
  if (heating) documents.push({ name: 'heating', html: heating, json: heatingReaderJson(scenario) })

  const files = {}
  for (const doc of documents) {
    const htmlPath = join(dir, `${doc.name}.html`)
    writeFileSync(htmlPath, doc.html)
    writeFileSync(join(dir, 'expected', `${doc.name}.json`), `${JSON.stringify(doc.json, null, 2)}\n`)
    files[doc.name] = { html: `${doc.name}.html`, expected: `expected/${doc.name}.json` }
    if (canRender) {
      renderBillFiles(htmlPath, join(dir, `${doc.name}.png`), join(dir, `${doc.name}.pdf`))
      files[doc.name].png = `${doc.name}.png`
      files[doc.name].pdf = `${doc.name}.pdf`
    }
  }
  manifest.push({ id: scenario.id, title: scenario.title, town: scenario.town, dir: `scenarios/${scenario.id}`, files })
  console.log(`${scenario.id.padEnd(34)} ${documents.map((d) => d.name).join(' + ')}`)
}

if (!ONLY) {
  writeFileSync(
    join(OUT, 'manifest.json'),
    `${JSON.stringify({ note: 'Synthetic scenario bills. Not real bills. Regenerate with: node scripts/demo-bills/scenarios.mjs', scenarios: manifest }, null, 2)}\n`,
  )
}
