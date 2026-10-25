#!/usr/bin/env node
/**
 * @built F-168 prove the voice path, instead of believing it
 *
 * Every failure this project has had on the calling path was a configuration fact
 * nobody had checked: a key that existed but belonged to a workspace with no agent, a
 * number that was never imported, a switch under a name the code did not read. So this
 * script asks the platform the same five questions the route cares about, in order,
 * and prints one line per answer with the fix attached.
 *
 *   npm run voice:check                      # key, credits, agents, numbers, plan
 *   npm run voice:check -- --dial +1617555…  # place one real call and read it back
 *
 * It never prints the key. It never dials unless `--dial` is on the command line.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://api.elevenlabs.io/v1'
const POLL_MS = 5_000
const MAX_WAIT_MS = 300_000
const CREDIT_FLOOR = 1_000

const dialArg = process.argv.findIndex((arg) => arg === '--dial')
const dialTo = dialArg === -1 ? null : (process.argv[dialArg + 1] ?? '')
const json = process.argv.includes('--json')

/** `--env-file-if-exists` is the happy path; this is the fallback for a bare `node`. */
function loadEnv() {
  if (process.env.ELEVENLABS_API_KEY) return
  try {
    for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (!match) continue
      const value = match[2].replace(/^["']|["']$/g, '')
      if (process.env[match[1]] === undefined) process.env[match[1]] = value
    }
  } catch {
    // No .env.local: the missing-variable report below is the useful output.
  }
}

loadEnv()

const checks = []
function check(name, ok, detail, fix, warn = false) {
  checks.push({ name, ok, warn: ok && warn, detail, fix: ok && !warn ? null : fix })
}

function env(name) {
  const value = process.env[name]
  return value && value.trim() !== '' ? value.trim() : null
}

async function call(path, init = {}) {
  const key = env('ELEVENLABS_API_KEY')
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

async function main() {
  const key = env('ELEVENLABS_API_KEY')
  const agentId = env('ELEVENLABS_AGENT_ID')
  const phoneNumberId = env('ELEVENLABS_PHONE_NUMBER_ID')
  const outreachEnabled =
    env('PROVIDER_OUTREACH_ENABLED') === 'true' || env('PROVIDER_CALLS_ENABLED') === 'true'

  check('ELEVENLABS_API_KEY is set', Boolean(key), key ? 'present' : 'absent', 'Add ELEVENLABS_API_KEY to .env.local')
  if (!key) {
    report()
    return
  }

  // An Agents-only key is the least-privilege setup and cannot read `/user`, so the
  // key is proved against the API the calls actually use.
  const agents = await call('/convai/agents')
  check(
    'the key is accepted by the platform',
    agents.ok,
    agents.ok ? 'reads ElevenLabs Agents' : `HTTP ${agents.status} ${agents.body?.detail?.message ?? ''}`.trim(),
    'Re-issue the key in the ElevenLabs dashboard with ElevenLabs Agents set to Write; an unaccepted key cannot create calls.',
  )
  if (!agents.ok) {
    report()
    return
  }

  const subscription = await call('/user/subscription')
  const used = Number(subscription.body?.character_count ?? 0)
  const limit = Number(subscription.body?.character_limit ?? 0)
  const remaining = Math.max(0, limit - used)
  const unreadable = subscription.status === 401 || subscription.status === 403
  check(
    'the workspace has voice credits left',
    unreadable || (subscription.ok && remaining >= CREDIT_FLOOR),
    unreadable
      ? 'unverified: this key has no User read permission'
      : subscription.ok
        ? `${remaining.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} left`
        : `HTTP ${subscription.status}`,
    unreadable
      ? 'Open ElevenLabs → Usage and confirm credits before a live demo; a call with no credits connects silent.'
      : `Only ${remaining.toLocaleString('en-US')} characters left. A call of a few minutes needs thousands, so top the workspace up before a live demo (ElevenLabs → Usage).`,
    unreadable,
  )

  const agentList = Array.isArray(agents.body?.agents) ? agents.body.agents : []
  const configuredAgent = agentId ? agentList.find((agent) => (agent.agent_id ?? agent.id) === agentId) : null
  check(
    'the configured agent exists',
    Boolean(configuredAgent),
    configuredAgent
      ? `${configuredAgent.name} (${agentId})`
      : agentList.length === 0
        ? 'no agents in this workspace'
        : `${agentList.length} agent(s), none matching ELEVENLABS_AGENT_ID`,
    agentList.length === 0
      ? 'Create it from the reviewed config: npm run agents:sync -- --create'
      : 'Set ELEVENLABS_AGENT_ID to one of: ' +
        agentList.map((agent) => `${agent.agent_id ?? agent.id} (${agent.name})`).join(', '),
  )

  const numbers = await call('/convai/phone-numbers')
  const numberList = Array.isArray(numbers.body) ? numbers.body : Array.isArray(numbers.body?.phone_numbers) ? numbers.body.phone_numbers : []
  const configuredNumber = phoneNumberId ? numberList.find((row) => row.phone_number_id === phoneNumberId) : null
  check(
    'the outbound number exists',
    Boolean(configuredNumber),
    configuredNumber
      ? `${configuredNumber.phone_number} (${phoneNumberId})`
      : numberList.length === 0
        ? 'no phone numbers imported into this workspace'
        : `${numberList.length} number(s), none matching ELEVENLABS_PHONE_NUMBER_ID`,
    numberList.length === 0
      ? 'Import a Twilio number in ElevenLabs → Phone Numbers (needs the Twilio SID, auth token and number), then set ELEVENLABS_PHONE_NUMBER_ID from GET /v1/convai/phone-numbers.'
      : 'Set ELEVENLABS_PHONE_NUMBER_ID to one of: ' +
        numberList.map((row) => `${row.phone_number_id} (${row.phone_number})`).join(', '),
  )

  // Off is the demo setup, not a fault: team lines (allowlist rows) still dial.
  check(
    'real businesses may be dialled',
    true,
    outreachEnabled ? 'yes (PROVIDER_OUTREACH_ENABLED=true)' : 'no, team test lines only (PROVIDER_OUTREACH_ENABLED is off)',
    null,
  )

  const ready = checks.every((entry) => entry.ok)
  if (dialTo !== null) {
    if (!ready) {
      console.log('\nNot dialling: the checks above are not all green.')
    } else {
      await placeCall({ to: dialTo, agentId, phoneNumberId })
    }
  }

  report()
  if (!ready) process.exitCode = 1
}

async function placeCall({ to, agentId, phoneNumberId }) {
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    console.log(`\nNot dialling: "${to}" is not E.164 (try +16175551234).`)
    process.exitCode = 1
    return
  }
  console.log(`\nDialling ${to} …`)
  const started = await call('/convai/twilio/outbound-call', {
    method: 'POST',
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: to,
      conversation_initiation_client_data: {
        dynamic_variables: { town: 'Arlington', vertical: 'installer', fuel: 'heat pump', current_fuel: 'oil', tons: '3.5', sqft: '1800' },
      },
    }),
  })
  if (!started.ok) {
    check('the platform accepted the call', false, `HTTP ${started.status} ${JSON.stringify(started.body).slice(0, 300)}`, 'Read the platform message; a 422 usually means the number is not imported or is not outbound-capable.')
    return
  }
  const conversationId = started.body?.conversation_id ?? started.body?.conversationId
  check('the platform accepted the call', Boolean(conversationId), conversationId ?? 'no conversation id returned', 'The call was refused without a reason. Check the number is outbound-capable.')
  if (!conversationId) return

  console.log(`Conversation ${conversationId}. Polling until it finishes (max 5 minutes)…`)
  const deadline = Date.now() + MAX_WAIT_MS
  let conversation = null
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const read = await call(`/convai/conversations/${encodeURIComponent(conversationId)}`)
    if (!read.ok) continue
    conversation = read.body
    const status = conversation?.status
    process.stdout.write(`  ${status}\n`)
    if (['done', 'completed', 'failed', 'error'].includes(String(status))) break
  }
  if (!conversation) {
    check('the conversation could be read back', false, 'no response from the platform', 'The call may still be running; re-read it with the conversation id above.')
    return
  }
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : []
  const results = conversation.analysis?.data_collection_results ?? conversation.data_collection_results ?? {}
  check('the conversation finished', ['done', 'completed'].includes(String(conversation.status)), String(conversation.status), 'A failed or unanswered call still proves the dial path; read the platform status for the reason.')
  check('the call produced a transcript', transcript.length > 0, `${transcript.length} turns`, 'No transcript means no TTS audio: check the workspace credits above.')
  check(
    'the extraction returned the installer fields',
    Object.keys(results).length > 0,
    Object.keys(results).join(', ') || 'none',
    'The agent answered but extracted nothing; check platform_settings.data_collection on the agent.',
  )
  if (transcript.length > 0) {
    console.log('\nTranscript (last 6 turns):')
    for (const turn of transcript.slice(-6)) {
      console.log(`  ${turn.role ?? '?'}: ${String(turn.message ?? turn.text ?? '').slice(0, 200)}`)
    }
  }
  const ballpark = results.ballpark_per_ton
  if (ballpark !== undefined) {
    console.log(`\nballpark_per_ton: ${JSON.stringify(ballpark).slice(0, 200)}`)
  }
}

function report() {
  const lines = checks.map((entry) => `${entry.warn ? 'WARN' : entry.ok ? 'PASS' : 'FAIL'}  ${entry.name} — ${entry.detail}`)
  if (json) {
    console.log(JSON.stringify(checks, null, 2))
  } else {
    console.log(lines.join('\n'))
    const fixes = checks.filter((entry) => entry.fix)
    if (fixes.length > 0) {
      console.log('\nWhat to do:')
      for (const entry of fixes) console.log(`  - ${entry.name}: ${entry.fix}`)
    }
    if (checks.every((entry) => entry.ok)) {
      console.log(`\n${fixes.length > 0 ? 'Ready, with the warning above' : 'All green'}: a confirmed request can be dialled from the app.`)
    }
  }
}

main().catch((error) => {
  console.error(`the check itself failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
