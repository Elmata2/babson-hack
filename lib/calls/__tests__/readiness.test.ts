import { describe, expect, it } from 'vitest'

import { publicReadiness, readinessLine, voiceReadiness } from '../readiness'
import { callPlan, publicPlan } from '../plan'

const FULL = {
  ELEVENLABS_API_KEY: 'k',
  ELEVENLABS_AGENT_ID: 'a',
  ELEVENLABS_PHONE_NUMBER_ID: 'p',
  PROVIDER_OUTREACH_ENABLED: 'true',
} as unknown as NodeJS.ProcessEnv

describe('voiceReadiness', () => {
  it('is ready only when all three values exist and outreach is on', () => {
    expect(voiceReadiness(FULL)).toMatchObject({ canDial: true, missing: [] })
  })

  it('reads the documented switch and the legacy alias the same way', () => {
    const legacy = { ...FULL, PROVIDER_OUTREACH_ENABLED: undefined, PROVIDER_CALLS_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv
    expect(voiceReadiness(legacy).canDial).toBe(true)
  })

  it('names every missing variable, in the order a deployer should set them', () => {
    const readiness = voiceReadiness({} as unknown as NodeJS.ProcessEnv)
    expect(readiness.canDial).toBe(false)
    expect(readiness.missing).toEqual([
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_AGENT_ID',
      'ELEVENLABS_PHONE_NUMBER_ID',
      'PROVIDER_OUTREACH_ENABLED',
    ])
  })

  it('never exposes the key itself, only its presence', () => {
    const readiness = voiceReadiness(FULL)
    expect(JSON.stringify(readiness)).not.toContain('"k"')
    expect(Object.values(readiness).every((value) => typeof value !== 'string' || value.startsWith('ELEVEN') || value === 'PROVIDER_OUTREACH_ENABLED')).toBe(true)
  })

  it('points at the kit instead of narrating a missing value', () => {
    const readiness = voiceReadiness({ ELEVENLABS_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)
    const line = readinessLine(readiness)
    expect(line).toContain('switch kit')
    expect(line).not.toContain('ELEVENLABS')
    expect(readinessLine(voiceReadiness(FULL))).toContain('Nothing is dialled until you approve')
  })

  it('in demo mode never shows a deployment’s configuration gap', () => {
    const line = readinessLine(voiceReadiness({} as unknown as NodeJS.ProcessEnv), { demo: true })
    expect(line).toContain('Demo mode')
    expect(line).toContain('Nothing is dialled')
    expect(line).not.toContain('ELEVENLABS')
  })

  it('sends variable names only to a caller that asked for them', () => {
    const readiness = voiceReadiness({} as unknown as NodeJS.ProcessEnv)
    expect(publicReadiness(readiness).missing).toEqual([])
    expect(publicReadiness(readiness, { debug: true }).missing.length).toBe(4)
    expect(publicReadiness(readiness, { demo: true, debug: true })).toEqual({ canDial: false, missing: [] })
  })
})

describe('publicPlan', () => {
  const ENV = {
    ELEVENLABS_API_KEY: 'sk_secret_value',
    ELEVENLABS_AGENT_ID: 'agent_x',
    ELEVENLABS_PHONE_NUMBER_ID: 'phnum_x',
    PROVIDER_OUTREACH_ENABLED: 'true',
  } as unknown as NodeJS.ProcessEnv

  it('strips the agent, so the API key cannot reach the browser RSC payload', () => {
    const shared = publicPlan(callPlan([], ENV))
    expect(Object.keys(shared).sort()).toEqual(['mode', 'notice', 'reason'])
    expect(JSON.stringify(shared)).not.toContain('sk_secret_value')
    expect(JSON.stringify(shared)).not.toContain('agent_x')
  })

  it('drops the deployer-facing reason in demo mode', () => {
    const ready = publicPlan(callPlan([], ENV), { demo: true })
    expect(ready.reason).toBeNull()
    expect(ready.notice).toBeNull()
    expect(publicPlan(callPlan([], {} as unknown as NodeJS.ProcessEnv), { demo: true }).reason).toBeNull()
  })
})
