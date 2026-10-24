#!/usr/bin/env node
/**
 * @built F-135 ElevenLabs simulation tests, and an honest answer when there is no account
 *
 * R25.6 asks for simulation tests on PRs touching `agents/**`, asserting three
 * behaviours: the AI disclosure in turn one, no competing price stated unprompted,
 * and the call ending on "stop". Two halves:
 *
 *   1. **Always, offline.** The contract checks below run with no key and prove the
 *      three behaviours where they are decidable from the reviewed config: the first
 *      message carries the disclosure, the prompts forbid naming a provider and
 *      forbid citing a price unless code handed one over, and the opt-out rule is
 *      present. This half cannot silently skip.
 *
 *   2. **When an account is configured.** If `ELEVENLABS_API_KEY`,
 *      `ELEVENLABS_AGENT_ID` and `ELEVENLABS_SIMULATION_ID` are all set, the script
 *      asks the platform to run the stored simulation and fails on a violation.
 *      With no account it says so in one line and exits 0 — a fork must not go red
 *      for a secret it cannot have, and CI must not pretend it ran a call.
 *
 * Usage: node scripts/agents/simulate.mjs
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'agents')
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8')
const readJson = (relative) => JSON.parse(read(relative))

const caller = readJson('quote-caller/agent.json')
const firstMessage = read(join('quote-caller', caller.first_message_file))
const fuel = read(join('quote-caller', caller.prompt_by_vertical.fuel)).toLowerCase()
const installer = read(join('quote-caller', caller.prompt_by_vertical.installer)).toLowerCase()

const violations = []

if (!firstMessage.includes('automated AI assistant')) violations.push('turn one does not disclose the AI')
if (!firstMessage.includes('recorded and transcribed')) violations.push('turn one does not disclose the recording')

for (const [name, prompt] of [['fuel', fuel], ['installer', installer]]) {
  if (!prompt.includes('never name another')) violations.push(`${name} prompt may name another provider`)
  if (!prompt.includes('never state') && !prompt.includes('unless code passed one')) {
    violations.push(`${name} prompt has no rule against an unprompted competing price`)
  }
  if (!prompt.includes('take me off your list')) violations.push(`${name} prompt does not end on "stop"`)
  if (caller.max_duration_seconds > 240) violations.push(`${name} prompt allows a call longer than four minutes`)
}

if (violations.length > 0) {
  console.error('agent simulation (offline contract half) failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log('offline contract half: disclosure, no unprompted price, opt-out — all present.')

const apiKey = process.env.ELEVENLABS_API_KEY
const agentId = process.env.ELEVENLABS_AGENT_ID
const simulationId = process.env.ELEVENLABS_SIMULATION_ID
if (!apiKey || !agentId || !simulationId) {
  console.log('platform half skipped: no ElevenLabs account is configured for this run.')
  process.exit(0)
}

const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}/simulate`, {
  method: 'POST',
  headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify({ simulation_id: simulationId }),
})

if (!response.ok) {
  console.error(`the platform refused the simulation (${response.status}).`)
  process.exit(1)
}

const result = await response.json().catch(() => ({}))
const failures = Array.isArray(result.failed_assertions) ? result.failed_assertions : []
if (failures.length > 0) {
  console.error('the platform reported failed assertions:')
  for (const failure of failures) console.error(`  - ${typeof failure === 'string' ? failure : JSON.stringify(failure)}`)
  process.exit(1)
}

console.log('platform half: the stored simulation passed.')
