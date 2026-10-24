/**
 * @built F-132 CI is a gate, so the gate needs a test: workflow file, guard script
 * @built F-133 gitleaks job and config stay wired the way R25.4 requires
 *
 * Every assertion here reads a file as text. No YAML parser, no dependency, no
 * network: the workflow is small enough that the lines which matter can be named
 * exactly, and a renamed step or a dropped command fails `npm run check` instead
 * of silently turning a gate into decoration.
 *
 * The checks are deliberately coupled to intent, not formatting: `node-version:
 * 20` matches whether the value is quoted or not, but a downgrade to 18 fails.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Vitest runs from the repository root (see `vitest.config.ts`).
const ROOT = process.cwd()

const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8')
const readJson = (relative: string) => JSON.parse(read(relative)) as Record<string, unknown>

const WORKFLOW = '.github/workflows/ci.yml'
const GUARD = 'scripts/ci-guard.mjs'
const GITLEAKS_CONFIG = '.gitleaks.toml'

describe('ci workflow', () => {
  it('runs on push and on pull requests into master', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).toMatch(/^on:/m)
    expect(yaml).toMatch(/^ {2}push:/m)
    expect(yaml).toMatch(/^ {2}pull_request:/m)
    // PRs are gated on the branch that ships.
    expect(yaml).toMatch(/branches:\s*\[master\]/)
    // A key pushed to any branch fails the scan before it can reach a PR.
    expect(yaml).toMatch(/branches:\s*\['\*\*'\]/)
  })

  it('cancels superseded pull-request runs without killing a master push', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).toMatch(/^concurrency:/m)
    expect(yaml).toMatch(/group:.*github\.event\.pull_request\.number \|\| github\.ref/)
    expect(yaml).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
  })

  it('installs the lockfile on Node 20 and runs the full check', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).toMatch(/runs-on:\s*ubuntu-latest/)
    expect(yaml).toMatch(/^ {10}node-version:\s*'?20'?$/m)
    expect(yaml).toMatch(/^ {10}cache:\s*npm$/m)
    expect(yaml).toMatch(/^ {8}run:\s*npm ci$/m)
    expect(yaml).toMatch(/^ {8}run:\s*npm run check$/m)
  })

  it('fails on build-log drift and on a gitignored /.kiro', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).toContain('node scripts/ci-guard.mjs --buildlog')
    expect(yaml).toContain('node scripts/ci-guard.mjs --kiro')
  })

  it('leaves builds to Vercel (R25.8) and keeps the job small', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).not.toMatch(/run:.*next build/)
    expect(yaml).not.toMatch(/^matrix:/m)
    expect(yaml).not.toMatch(/\t/)
    expect(yaml).toMatch(/timeout-minutes:/)
  })
})

describe('gitleaks job', () => {
  it('scans the whole history with the checked-in config', () => {
    const yaml = read(WORKFLOW)

    expect(yaml).toMatch(/gitleaks git .*--config \.gitleaks\.toml/)
    expect(yaml).toContain('--redact')
    // Deleted keys live on in history; a shallow clone would call it clean.
    expect(yaml).toMatch(/fetch-depth:\s*0/)
  })

  it('needs no paid license token', () => {
    const yaml = read(WORKFLOW)

    // gitleaks-action@v2 refuses to run for an org without GITLEAKS_LICENSE.
    // The release binary has no such gate, so neither does this workflow.
    expect(yaml).not.toMatch(/secrets\.GITLEAKS_LICENSE/)
    expect(yaml).not.toMatch(/uses:\s*gitleaks\/gitleaks-action/)
    expect(yaml).toMatch(/GITLEAKS_VERSION:\s*8\.30\.1/)
    expect(yaml).toMatch(/gitleaks_\$\{GITLEAKS_VERSION\}_linux_x64\.tar\.gz/)
  })

  it('keeps the default ruleset and allowlists nothing', () => {
    const config = read(GITLEAKS_CONFIG)

    expect(config).toMatch(/^\[extend\]$/m)
    expect(config).toMatch(/useDefault = true/)
    // No allowlist at all. gitleaks rejects an empty one, so "nothing is
    // exempt" has to mean the section is absent — and it has to stay absent.
    expect(config).not.toMatch(/^\[\[?allowlists?\]\]$/m)
    expect(config).not.toMatch(/^\s*paths = \[.+\]$/m)
    expect(config).not.toMatch(/^\s*regexes = \[.+\]$/m)
  })
})

describe('ci guard script', () => {
  it('is wired into package.json', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>

    expect(scripts.guard).toBe('node scripts/ci-guard.mjs')
  })

  it('implements both guards with git, not with a reimplementation', () => {
    const guard = read(GUARD)

    // R25.2 — regenerate, then compare against the committed copy.
    expect(guard).toContain("scripts/buildlog.mjs")
    expect(guard).toContain("'hook'")
    expect(guard).toContain('HEAD:')
    // R25.3 — the check the spec names, done the way that actually catches a
    // rule: `--no-index`, because the plain form reports "not ignored" for a
    // committed directory and would pass with `.kiro/` in .gitignore.
    expect(guard).toContain("'check-ignore'")
    expect(guard).toContain("'--no-index'")
    expect(guard).toContain('.kiro/specs/switchpoint/requirements.md')
    // A hand edit to BUILDLOG.md would be wiped by the regeneration before it
    // could be diffed, so the working tree is inspected first.
    expect(guard).toContain("'--porcelain'")
    // A failure has to tell the reader the command that fixes it.
    expect(guard).toContain('node scripts/buildlog.mjs hook')
  })

  it('compares the generated log without its volatile header sha', () => {
    const guard = read(GUARD)

    // The header records the HEAD sha at generation time, so a raw
    // `git diff -- BUILDLOG.md` can never pass on the commit that ships the
    // regenerated file. The comparison normalises that one token only.
    expect(guard).toContain('`<sha>`')
    expect(guard).not.toMatch(/git diff --exit-code -- BUILDLOG\.md/)
  })

  it('is plain Node with no new dependency', () => {
    const guard = read(GUARD)

    expect(guard).toContain("from 'node:fs'")
    expect(guard).not.toMatch(/^import .* from '(?!node:|path)/m)
    const pkg = readJson('package.json')
    const deps = {
      ...(pkg.dependencies as Record<string, string>),
      ...(pkg.devDependencies as Record<string, string>),
    }
    expect(Object.keys(deps)).not.toContain('yaml')
    expect(Object.keys(deps)).not.toContain('gitleaks')
  })
})

describe('feature markers', () => {
  it('marks F-132 and F-133 where the build log will find them', () => {
    // `scripts/` is one of the directories `scripts/buildlog.mjs` scans; a marker
    // in `.github/` would be invisible to it.
    const guard = read(GUARD)

    expect(guard).toContain('@built F-132')
    expect(guard).toContain('@built F-133')
  })
})
