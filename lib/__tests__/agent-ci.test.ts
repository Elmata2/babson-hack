/**
 * @built F-135 the simulation workflow is gated on agents/** and cannot go red without a secret
 * @built F-136 the sync workflow runs on merge to master, after an offline validation
 *
 * R25.6 and R25.7 are the two rows that turn the agent from a prompt in a folder into
 * something a reviewer can trust. Like `ci-config.test.ts`, this reads the workflow
 * files as text: no YAML parser, no dependency. The assertions name the intent — the
 * trigger, the order, the skip — so a renamed step fails `npm run check` instead of
 * quietly turning a gate into decoration.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8')

const SIM = '.github/workflows/agent-sim.yml'
const SYNC = '.github/workflows/agent-sync.yml'
const PACKAGE = 'package.json'

describe('agent simulation workflow', () => {
  const yaml = read(SIM)

  it('runs only on pull requests, and only when the agent changed', () => {
    expect(yaml).toMatch(/^on:/m)
    expect(yaml).toMatch(/^ {2}pull_request:/m)
    expect(yaml).not.toMatch(/^ {2}push:/m)
    expect(yaml).toContain("'agents/**'")
    expect(yaml).toMatch(/branches:\s*\[master\]/)
  })

  it('runs the contract tests and the simulation script', () => {
    expect(yaml).toContain('npx vitest run agents')
    expect(yaml).toContain('node scripts/agents/simulate.mjs')
  })

  it('passes the three secrets the platform half needs, and no others', () => {
    expect(yaml).toContain('secrets.ELEVENLABS_API_KEY')
    expect(yaml).toContain('secrets.ELEVENLABS_AGENT_ID')
    expect(yaml).toContain('secrets.ELEVENLABS_SIMULATION_ID')
    expect(yaml).not.toContain('TWILIO')
  })

  it('finishes inside the CI budget (R25.8)', () => {
    expect(yaml).toMatch(/timeout-minutes:\s*5/)
  })
})

describe('agent sync workflow', () => {
  const yaml = read(SYNC)

  it('runs on push to master, on an agent change', () => {
    expect(yaml).toMatch(/^ {2}push:/m)
    expect(yaml).toMatch(/branches:\s*\[master\]/)
    expect(yaml).toContain("'agents/**'")
  })

  it('validates offline before it can push', () => {
    const validate = yaml.indexOf('sync.mjs --check')
    const push = yaml.indexOf('run: node scripts/agents/sync.mjs\n')
    expect(validate).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(validate)
    expect(yaml).toContain('needs: validate')
  })

  it('needs a key and an agent id, and nothing else', () => {
    expect(yaml).toContain('secrets.ELEVENLABS_API_KEY')
    expect(yaml).toContain('secrets.ELEVENLABS_AGENT_ID')
  })
})

describe('the scripts themselves', () => {
  it('validate the config with no network when asked to', async () => {
    const sync = read('scripts/agents/sync.mjs')
    expect(sync).toContain('--check')
    expect(sync).toContain('process.exit(0)')
    expect(sync).toContain('max_duration_seconds must be 240')
  })

  it('say plainly when no account is configured instead of pretending', () => {
    const simulate = read('scripts/agents/simulate.mjs')
    expect(simulate).toContain('platform half skipped')
    expect(simulate).toContain('offline contract half')
  })

  it('are wired as npm scripts, so a person can run what CI runs', async () => {
    const pkg = JSON.parse(read(PACKAGE)) as { scripts: Record<string, string> }
    expect(pkg.scripts['agents:check']).toBe('node scripts/agents/sync.mjs --check')
    expect(pkg.scripts['agents:sync']).toBe('node scripts/agents/sync.mjs')
    expect(pkg.scripts['agents:simulate']).toBe('node scripts/agents/simulate.mjs')
  })
})
