/**
 * @built F-50 R14.2 — the keyboard path, asserted against the source
 *
 * The DOM-level behaviours (Tab order, Escape, focus return) belong to the
 * platform: the skip link is a real anchor, the figures are real buttons, and the
 * drawer is a native `<dialog>` opened with `showModal()`, which is what gives the
 * focus trap and restores focus to the trigger. What a refactor can silently
 * delete is the wiring, so that is what this test reads: the anchor target, the
 * `id` on every `<main>`, the outline rule, and the drawer's use of the native
 * modal API rather than a hand-rolled overlay.
 *
 * The one piece of real logic — when to call `showModal()`/`close()` — is
 * extracted into `lib/a11y/focus` and tested directly.
 */

import { describe, expect, it } from 'vitest'

import { readSource, sourceFiles } from './source'

describe('R14.2 — skip to content', () => {
  it('is the first thing in the body, and points at the main landmark', () => {
    const layout = readSource('app/layout.tsx')
    expect(layout).toContain('href="#main"')
    expect(layout).toContain('Skip to content')
    // Hidden until focused, then pinned and visible — never `display:none`.
    expect(layout).toContain('sr-only')
    expect(layout).toContain('focus:not-sr-only')
  })

  it('lands on an element that exists on every page that renders a main', () => {
    const pages = sourceFiles(['app']).filter((file) => file.path.endsWith('page.tsx') || file.path.endsWith('layout.tsx'))
    for (const page of pages) {
      if (!page.text.includes('<main')) continue
      expect(page.text, `${page.path} renders <main> without id="main"`).toContain('id="main"')
    }
  })
})

describe('R14.2 — visible focus', () => {
  it('draws a focus ring that is not colouring the text', () => {
    const css = readSource('app/globals.css')
    expect(css).toMatch(/:focus-visible\s*\{/)
    expect(css).toMatch(/outline:\s*2px solid var\(--color-focus\)/)
    expect(css).toMatch(/outline-offset:\s*2px/)
  })
})

describe('R14.2 — the figures are buttons and the drawer is a modal dialog', () => {
  const figure = readSource('components/verdict/provenance-figure.tsx')

  it('opens from a real button, announced as opening a dialog', () => {
    expect(figure).toContain('type="button"')
    expect(figure).toContain('aria-haspopup="dialog"')
  })

  it('is a native dialog, so the platform supplies Escape and the focus trap', () => {
    expect(figure).toContain('<dialog')
    expect(figure).toContain('showModal()')
    expect(figure).toContain('onClose')
    expect(figure).toContain('aria-labelledby')
  })

  it('has a labelled close button inside the dialog', () => {
    expect(figure).toMatch(/aria-label="Close provenance"/)
    expect(figure).toContain('onClick={() => setOpen(false)}')
  })

  it('keeps focus in the dialog when it opens, rather than on the page behind it', () => {
    // The heading is not focusable; the close button is, so an explicit focus
    // call is the difference between a usable dialog and one a keyboard user
    // cannot reach without tabbing through the page behind the backdrop.
    expect(figure).toMatch(/closeButton|closeRef/)
    expect(figure).toMatch(/\.focus\(\)/)
  })
})

describe('R14.2 — the verdict numbers are reachable', () => {
  it('every headline figure on the verdict screen goes through the drawer', () => {
    const page = readSource('app/verdict/page.tsx')
    for (const id of ['savings', 'breakEven', 'oldCost', 'newCostSeasonal', 'newCostStandard', 'hdd', 'tons', 'fuelUse', 'scop']) {
      expect(page, `figure "${id}" is not wrapped in <Figure>`).toContain(`id="${id}"`)
    }
    for (const id of ['rebate', 'netCost', 'payback']) {
      expect(page, `stat "${id}" has no provenance entry`).toContain(`figure('${id}')`)
    }
    expect(page).toMatch(/<Figure\s+entries=\{entries\}/)
  })

  it('the dial is described in words, not only drawn', () => {
    const dial = readSource('components/verdict/verdict-dial.tsx')
    expect(dial).toContain('role="img"')
    expect(dial).toContain('aria-label')
    expect(dial).toContain('VERDICT_ORDER')
  })
})
