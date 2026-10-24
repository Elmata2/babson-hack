import { describe, expect, it } from 'vitest'

import { readinessLine, voiceReadiness } from '../readiness'

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

  it('says what is missing rather than that "there is no agent"', () => {
    const readiness = voiceReadiness({ ELEVENLABS_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)
    const line = readinessLine(readiness)
    expect(line).toContain('ELEVENLABS_AGENT_ID')
    expect(line).toContain('switch kit')
    expect(readinessLine(voiceReadiness(FULL))).toContain('Nothing is dialled until you approve')
  })
})
