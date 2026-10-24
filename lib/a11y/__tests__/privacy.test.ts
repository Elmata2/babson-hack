/**
 * @built F-50 R15.1 — no analytics, no third-party cookie, no cookie write
 *
 * R15.1 is a promise about what the shipped source does when it runs in a
 * browser, and there is no browser in this test setup. So the guard reads the
 * files themselves: no analytics vendor name, no analytics script, no cookie
 * read or write, no `Set-Cookie` anywhere in the route handlers, and no
 * dependency that would smuggle one in.
 *
 * Client storage is a different thing and is deliberately not banned here: the
 * saved profile lives in `localStorage` and the switch session in
 * `sessionStorage` (ADR-003). Neither leaves the machine, neither is sent to us,
 * and clearing site data removes both — which is what the footer promises.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROOT, filesMatching } from './source'

/** Vendors and endpoints whose presence would mean tracking. */
const ANALYTICS = [
  /\bgoogletagmanager\b/i,
  /\bgoogle-analytics\b/i,
  /\bgtag\s*\(/i,
  /\bplausible\.io\b/i,
  /\bposthog\b/i,
  /\bmixpanel\b/i,
  /\bamplitude\b/i,
  /\bsegment\.(?:io|com)\b/i,
  /@vercel\/analytics/i,
  /@next\/third-parties/i,
  /\bmatomo\b/i,
  /\bhotjar\b/i,
  /\bfullstory\b/i,
  /\bclarity\.ms\b/i,
  /\bconnect\.facebook\.net\b/i,
  /\bfbq\s*\(/i,
]

/** Cookie access of any kind, in source that ships. */
const COOKIES = [/\bdocument\.cookie\b/i, /\bset-cookie\b/i, /\bfrom ['"]next\/headers['"]/i, /\bcookies\s*\(\s*\)/i]

describe('R15.1 — no analytics', () => {
  for (const pattern of ANALYTICS) {
    it(`no source line matches ${pattern}`, () => {
      expect(filesMatching(pattern)).toEqual([])
    })
  }

  it('carries no analytics package in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    for (const name of names) {
      expect(name, `unexpected dependency ${name}`).not.toMatch(
        /analytics|posthog|mixpanel|amplitude|segment|matomo|hotjar|fullstory|gtag|plausible/i,
      )
    }
  })
})

describe('R15.1 — no cookie is read or written by this app', () => {
  for (const pattern of COOKIES) {
    it(`no source line matches ${pattern}`, () => {
      expect(filesMatching(pattern)).toEqual([])
    })
  }

  it('writes no cookie in a route handler', () => {
    const routes = filesMatching(/response\.headers\.set|headers\.set\s*\(/i).filter((hit) => hit.path.startsWith('app/api/'))
    for (const hit of routes) {
      expect(hit.line.toLowerCase()).not.toContain('cookie')
    }
  })

  it('sets no cookie in the Next config, where a session cookie would be configured', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    expect(config.toLowerCase()).not.toContain('cookie')
  })
})
