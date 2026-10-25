#!/usr/bin/env node
/**
 * @built F-136 push the agent config in `agents/` to ElevenLabs, on purpose, on merge
 *
 * The deployed agent must be the reviewed agent. So the source of truth is this
 * repository, and this script is the only thing that writes to the platform:
 *
 *   node scripts/agents/sync.mjs --check   # no network; validates and prints the plan
 *   node scripts/agents/sync.mjs           # PATCH the agent (needs a key + agent id)
 *   node scripts/agents/sync.mjs --create  # create the agent once, print its id
 *
 * No dependency outside the Node standard library (R11.5's spirit). A missing key is
 * a typed skip, not a failure: the workflow runs on merge, and a fork must not go red.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'agents')
const API = 'https://api.elevenlabs.io/v1/convai'
/** The only scalar types `AnalysisProperty` can extract. A nested object is a 422. */
const ANALYSIS_TYPES = ['boolean', 'string', 'integer', 'number']

function read(relative) {
  return readFileSync(join(ROOT, relative), 'utf8')
}

function readJson(relative) {
  return JSON.parse(read(relative))
}

const check = process.argv.includes('--check')
const create = process.argv.includes('--create')

const caller = readJson('quote-caller/agent.json')
const firstMessage = read(join('quote-caller', caller.first_message_file)).trim()
const fuelPrompt = read(join('quote-caller', caller.prompt_by_vertical.fuel))
const installerPrompt = read(join('quote-caller', caller.prompt_by_vertical.installer))
const collection = readJson('quote-caller/data-collection.json')

const problems = []
if (!firstMessage.includes('automated AI assistant')) problems.push('first message lost the AI disclosure')
if (!firstMessage.includes('recorded and transcribed')) problems.push('first message lost the recording disclosure')
if (caller.max_duration_seconds !== 240) problems.push('max_duration_seconds must be 240 (R19.5)')
if (Array.isArray(caller.server_tools) && caller.server_tools.length > 0) {
  problems.push('the quote caller must have no server tools (ADR-011)')
}
if (!collection.fuel || !collection.installer) problems.push('data collection is missing a vertical')
for (const vertical of ['fuel', 'installer']) {
  for (const field of collection[vertical] ?? []) {
    if (!ANALYSIS_TYPES.includes(field.type)) {
      problems.push(`data collection field ${vertical}.${field.name} has type "${field.type}", which the platform cannot extract`)
    }
  }
}

if (problems.length > 0) {
  console.error('agent config is not deployable:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

// The repo writes `{town}`; the platform substitutes `{{town}}` and leaves single
// braces as literal text the agent would read aloud.
const platformVariables = (text) => text.replace(/(?<!\{)\{([a-z_]+)\}(?!\})/g, '{{$1}}')

// The route drops null facts, and the platform refuses a call that leaves a referenced
// variable unset, so every variable the prompts name gets a spoken-safe default.
const promptText = `${firstMessage}\n${fuelPrompt}\n${installerPrompt}`
const placeholders = Object.fromEntries(
  [...new Set([...promptText.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]))].map((name) => [
    name,
    name === 'target_price' ? 'none' : 'not given',
  ]),
)

/**
 * The platform's `data_collection` is a flat map of `AnalysisProperty`
 * (`{ type, description }`) and accepts only the four scalar types in
 * `ANALYSIS_TYPES`. The reviewed file is grouped by vertical and nested, because
 * that is how a person reads it, so the flattening happens here — and the field
 * names stay exactly the ones `lib/calls/parse.ts` reads back out of a finished
 * conversation. A name that appears in both verticals (`needs_callback`) is
 * written once.
 */
function flattenCollection(grouped) {
  const flat = {}
  for (const vertical of ['fuel', 'installer']) {
    for (const field of grouped[vertical] ?? []) {
      if (flat[field.name]) continue
      flat[field.name] = { type: field.type, description: field.description }
    }
  }
  return flat
}

const dataCollection = flattenCollection(collection)

// The payload the platform accepts: one agent, the vertical prompt chosen per call
// through the `vertical` dynamic variable, and the post-call extraction schema.
//
// Built-in tools are named in `conversation_config.agent.prompt.built_in_tools`;
// `platform_settings` has no `tools` key in the current API and a 422 is the only
// thing an unknown key earns. Voicemail detection carries no message on purpose:
// the call ends rather than leaving one (R19.4).
const payload = {
  name: caller.name,
  conversation_config: {
    agent: {
      first_message: platformVariables(firstMessage),
      language: caller.language,
      dynamic_variables: { dynamic_variable_placeholders: { ...placeholders, vertical: 'fuel' } },
      prompt: {
        prompt: platformVariables(
          `This call's vertical is {vertical}. Follow only the section below for that vertical: "fuel" is the fuel dealer script, "installer" is the heat pump installer script.\n\n${fuelPrompt}\n\n---\n\n${installerPrompt}`,
        ),
        built_in_tools: {
          end_call: { name: 'end_call', params: { system_tool_type: 'end_call' } },
          voicemail_detection: {
            name: 'voicemail_detection',
            params: { system_tool_type: 'voicemail_detection', voicemail_message: null },
          },
        },
      },
    },
    tts: { model_id: 'eleven_flash_v2' },
    conversation: { max_duration_seconds: caller.max_duration_seconds },
  },
  platform_settings: {
    data_collection: dataCollection,
  },
}

if (check) {
  console.log(`agent config ok — ${caller.name}`)
  console.log(`  first message: ${firstMessage.length} chars, disclosure intact`)
  console.log(`  verticals: ${Object.keys(caller.prompt_by_vertical).join(', ')}`)
  console.log(`  extraction fields: ${Object.keys(dataCollection).length} flat (${collection.fuel.length} fuel, ${collection.installer.length} installer)`)
  console.log('  no network call was made (--check)')
  process.exit(0)
}

const apiKey = process.env.ELEVENLABS_API_KEY
const agentId = process.env.ELEVENLABS_AGENT_ID
if (!apiKey) {
  console.log('skipped: ELEVENLABS_API_KEY is not set, so nothing was pushed.')
  process.exit(0)
}
if (!agentId && !create) {
  console.log('skipped: ELEVENLABS_AGENT_ID is not set. Run with --create once, then store the id.')
  process.exit(0)
}

const url = agentId ? `${API}/agents/${encodeURIComponent(agentId)}` : `${API}/agents/create`
const response = await fetch(url, {
  method: agentId ? 'PATCH' : 'POST',
  headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
})

if (!response.ok) {
  // The platform's own message is the only useful thing here: a 422 without it
  // sends the next person hunting through the payload by hand.
  const detail = await response.text().catch(() => '')
  console.error(`the platform refused the update (${response.status}); the reviewed config is unchanged.`)
  if (detail.trim() !== '') console.error(`  ${detail.trim().slice(0, 2_000)}`)
  process.exit(1)
}

const body = await response.json().catch(() => ({}))
console.log(agentId ? `updated agent ${agentId}` : `created agent ${body.agent_id ?? '(id not returned)'} — store it as ELEVENLABS_AGENT_ID`)
