/**
 * The poll and delete routes only act on call refs this session was issued:
 * a conversation id guessed or lifted from another household is refused, and a
 * hand-edited `since` falls back to now instead of throwing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { signCallId } from '@/lib/switch/consent-token'

import { DELETE, GET } from '../[sessionId]/route'

const MINE = 'session-mine001'
const THEIRS = 'session-other02'

function ctx(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) }
}

function url(query: string): string {
  return `https://example.test/api/calls/${MINE}?${query}`
}

function liveEnv() {
  vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
  vi.stubEnv('ELEVENLABS_AGENT_ID', 'agent-1')
  vi.stubEnv('ELEVENLABS_PHONE_NUMBER_ID', 'phone-1')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('/api/calls/[sessionId] ownership', () => {
  it('refuses to poll a bare vendor id and a ref signed for another session, without touching the vendor', async () => {
    liveEnv()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const bare = await GET(new Request(url('call=conv_victim:test-fuel-a&town=Framingham')), ctx(MINE))
    expect(bare.status).toBe(403)
    expect(((await bare.json()) as { code: string }).code).toBe('bad_call_ref')

    const foreign = signCallId('conv_victim', THEIRS)
    const stolen = await GET(new Request(url(`call=${foreign}:test-fuel-a&town=Framingham`)), ctx(MINE))
    expect(stolen.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses to delete a conversation the session does not own', async () => {
    liveEnv()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const bare = await DELETE(new Request(url('call=conv_victim'), { method: 'DELETE' }), ctx(MINE))
    expect(bare.status).toBe(403)
    const foreign = await DELETE(
      new Request(url(`call=${signCallId('conv_victim', THEIRS)}`), { method: 'DELETE' }),
      ctx(MINE),
    )
    expect(foreign.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('polls and deletes the vendor id behind a ref issued for this session', async () => {
    liveEnv()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }))
    const ref = signCallId('conv_mine', MINE)

    const polled = await GET(new Request(url(`call=${ref}:test-fuel-a&town=Framingham`)), ctx(MINE))
    expect(polled.status).toBe(200)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/conversations/conv_mine')
    const records = ((await polled.json()) as { records: { conversationId: string }[] }).records
    expect(records[0]?.conversationId).toBe(ref)

    const deleted = await DELETE(new Request(url(`call=${ref}`), { method: 'DELETE' }), ctx(MINE))
    expect(((await deleted.json()) as { deleted: string[] }).deleted).toEqual([ref])
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain('/conversations/conv_mine')
  })

  it('refuses a malformed session id in the path', async () => {
    const response = await GET(new Request(url('call=demo-fuel-a')), ctx('../x'))
    expect(response.status).toBe(403)
  })
})

describe('/api/calls/[sessionId] since', () => {
  it.each(['garbage', '99999999999999999', '', '2026-13-45', '<script>'])('does not 500 on since=%s', async (since) => {
    const response = await GET(
      new Request(url(`call=demo-fuel-a:test-fuel-a&town=Framingham&demo=1&since=${encodeURIComponent(since)}`)),
      ctx(MINE),
    )
    expect(response.status).toBe(200)
  })

  it('keeps a valid ISO since', async () => {
    const since = new Date(Date.now() - 60_000).toISOString()
    const response = await GET(
      new Request(url(`call=demo-fuel-a:test-fuel-a&town=Framingham&demo=1&since=${encodeURIComponent(since)}`)),
      ctx(MINE),
    )
    expect(response.status).toBe(200)
  })
})
