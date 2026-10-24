#!/usr/bin/env node
/**
 * @built F-169 import one Twilio number into ElevenLabs and store its id
 *
 * The phone number is the last thing standing between this build and a real call, and
 * the manual version has four places to mistype something. This does the one thing
 * that needs the API — create the ConvAI phone number from Twilio's SID/token — prints
 * the id, and optionally writes it into `.env.local` for you.
 *
 *   npm run voice:number                      # list what is already imported
 *   npm run voice:number -- --number +1617… --write-env
 *
 * Reads ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * ELEVENLABS_AGENT_ID from the environment or `.env.local`. It never prints either
 * secret.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://api.elevenlabs.io/v1'

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (!match) continue
      const value = match[2].replace(/^["']|["']$/g, '')
      if (process.env[match[1]] === undefined) process.env[match[1]] = value
    }
  } catch {
    // A missing file is reported as a missing variable below.
  }
}

loadEnv()

const arg = (name) => {
  const i = process.argv.findIndex((value) => value === `--${name}`)
  return i === -1 ? null : (process.argv[i + 1] ?? '')
}
const writeEnv = process.argv.includes('--write-env')
const number = arg('number')
const label = arg('label') ?? 'Switchpoint outbound'

const key = process.env.ELEVENLABS_API_KEY?.trim()
const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
const token = process.env.TWILIO_AUTH_TOKEN?.trim()
const agentId = process.env.ELEVENLABS_AGENT_ID?.trim()

function die(message, fix) {
  console.error(`\n${message}`)
  if (fix) console.error(`  fix: ${fix}`)
  process.exit(1)
}

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': key, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  let body = null
  try {
    body = text.trim() === '' ? null : JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 400) }
  }
  return { ok: response.ok, status: response.status, body }
}

async function list() {
  const result = await api('/convai/phone-numbers')
  if (!result.ok) die(`Could not list numbers (HTTP ${result.status}).`, 'Check ELEVENLABS_API_KEY.')
  const rows = Array.isArray(result.body) ? result.body : (result.body?.phone_numbers ?? [])
  if (rows.length === 0) {
    console.log('No phone numbers are imported into this workspace yet.')
    return []
  }
  for (const row of rows) {
    console.log(`${row.phone_number_id}  ${row.phone_number}  ${row.label ?? ''}  provider=${row.provider ?? 'unknown'}`)
  }
  return rows
}

async function main() {
  if (!key) die('ELEVENLABS_API_KEY is not set.', 'Add it to .env.local')

  if (!number) {
    console.log('Imported numbers:')
    await list()
    console.log('\nTo import one: npm run voice:number -- --number +16175551234 --write-env')
    return
  }

  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    die(`"${number}" is not E.164.`, 'Write it as +16175551234 (country code, no spaces).')
  }
  if (!sid || !token) {
    die(
      'Twilio credentials are missing.',
      'Put TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local (Twilio Console → Account Info), then re-run.',
    )
  }
  if (!/^(AC|SK)[0-9a-fA-F]{32}$/.test(sid)) {
    die(`TWILIO_ACCOUNT_SID does not look like a Twilio SID (it starts with AC or SK).`, 'Copy it from Twilio Console → Account Info.')
  }

  const existing = await list()
  const already = existing.find((row) => row.phone_number === number)
  if (already) {
    console.log(`\n${number} is already imported as ${already.phone_number_id}.`)
  }

  let phoneNumberId = already?.phone_number_id ?? null
  if (!phoneNumberId) {
    const created = await api('/convai/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({
        phone_number: number,
        label,
        sid,
        token,
        ...(agentId ? { agent_id: agentId } : {}),
      }),
    })
    if (!created.ok) {
      const detail = JSON.stringify(created.body).slice(0, 500)
      die(
        `ElevenLabs refused the import (HTTP ${created.status}): ${detail}`,
        'The usual causes: the number is not a Twilio number this account owns, it is not voice-capable, or the SID/token pair is wrong.',
      )
    }
    phoneNumberId = created.body?.phone_number_id
    if (!phoneNumberId) die('The import succeeded but returned no phone_number_id.', 'List the numbers with npm run voice:number')
    console.log(`\nImported ${number} as ${phoneNumberId}`)
  }

  if (writeEnv) {
    const path = join(process.cwd(), '.env.local')
    const original = readFileSync(path, 'utf8')
    const line = `ELEVENLABS_PHONE_NUMBER_ID=${phoneNumberId}`
    const next = /^ELEVENLABS_PHONE_NUMBER_ID=.*$/m.test(original)
      ? original.replace(/^ELEVENLABS_PHONE_NUMBER_ID=.*$/m, line)
      : `${original.replace(/\n*$/, '')}\n${line}\n`
    writeFileSync(path, next)
    console.log(`Wrote ELEVENLABS_PHONE_NUMBER_ID=${phoneNumberId} to .env.local`)
  } else {
    console.log(`\nNow set ELEVENLABS_PHONE_NUMBER_ID=${phoneNumberId} (or re-run with --write-env)`)
  }

  console.log('\nNext: npm run voice:check   (it should be all PASS)')
  console.log('Then:  npm run voice:call -- --dial +16175551234')
}

main().catch((error) => {
  console.error(`the import itself failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
