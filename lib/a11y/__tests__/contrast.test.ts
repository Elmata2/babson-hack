/**
 * @built F-50 R14.1 — the contrast audit, computed from `app/globals.css`
 *
 * The palette is authored in OKLCH. This test does what a colour checker does:
 * reads the real `--color-*` declarations, converts each token to sRGB, turns it
 * into `#rrggbb`, and computes the WCAG 2.2 ratio for every pair the product
 * actually renders. A token edit that drops a pair below AA fails here, with the
 * two hex values and the measured ratio in the message.
 *
 * Sizes come from the type scale: `--text-micro` (12px) and `--text-eyebrow`
 * (11px) are body-size text and need 4.5:1; `--text-display` and `--text-number`
 * are large and could pass at 3:1, but the screen never needs that allowance, so
 * the stated pairs are held to 4.5 anyway.
 *
 * `--color-rule` and `--color-rule-strong` are hairlines that group content; no
 * control and no state is identified by them alone (every outlined control also
 * carries a text label), so they are not asserted here. Every coloured thing that
 * *is* informative — the verdict tones — is asserted at the 3:1 non-text minimum,
 * because the dial draws them.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  LARGE_TEXT_CONTRAST_MIN,
  NON_TEXT_CONTRAST_MIN,
  TEXT_CONTRAST_MIN,
  blendOver,
  contrastFromHex,
  contrastRatio,
  contrastTokenPair,
  hexOf,
  oklchToSrgb,
  parseHex,
  parseOklch,
  textMinimum,
  tokenToSrgb,
} from '@/lib/a11y/contrast'

const CSS = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8')

/** Every `--color-name: oklch(...)` declaration in the stylesheet. */
function tokens(css: string): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = /--color-([a-z0-9-]+):\s*(oklch\([^)]*\))\s*;/gi
  for (const match of css.matchAll(pattern)) {
    const [, name, value] = match
    found.set(name, value)
  }
  return found
}

const TOKENS = tokens(CSS)

/** A documented pair: where it appears and what it must clear. */
interface Pair {
  fg: string
  bg: string
  where: string
  min: number
}

const TONES = ['switch', 'deadline', 'hold', 'loss'] as const

const TEXT_PAIRS: Pair[] = [
  { fg: 'ink', bg: 'paper', where: 'body text on the page', min: TEXT_CONTRAST_MIN },
  { fg: 'ink', bg: 'surface', where: 'body text in a card', min: TEXT_CONTRAST_MIN },
  { fg: 'ink', bg: 'paper-sunk', where: 'assumptions strip and footer', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-muted', bg: 'paper', where: 'secondary text under a headline', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-muted', bg: 'surface', where: 'secondary text in a card at 12px', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-muted', bg: 'paper-sunk', where: 'the why-list under the assumptions', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-faint', bg: 'paper', where: 'eyebrows and micro labels at 11–12px', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-faint', bg: 'surface', where: 'source dates in the drawer at 12px', min: TEXT_CONTRAST_MIN },
  { fg: 'ink-faint', bg: 'paper-sunk', where: 'assumption chips at 12px', min: TEXT_CONTRAST_MIN },
  { fg: 'paper', bg: 'ink', where: 'the primary button label', min: TEXT_CONTRAST_MIN },
  ...TONES.flatMap((tone) => [
    { fg: 'ink', bg: `${tone}-tint`, where: `the verdict section body on the ${tone} tint`, min: TEXT_CONTRAST_MIN },
    {
      fg: 'ink-muted',
      bg: `${tone}-tint`,
      where: `the verdict detail line on the ${tone} tint`,
      min: TEXT_CONTRAST_MIN,
    },
    {
      fg: 'ink-faint',
      bg: `${tone}-tint`,
      where: `the eyebrow inside the ${tone} verdict section`,
      min: TEXT_CONTRAST_MIN,
    },
    { fg: tone, bg: `${tone}-tint`, where: `the ${tone} word on its own tint`, min: TEXT_CONTRAST_MIN },
    { fg: tone, bg: 'surface', where: `a ${tone} inline message in a card or form`, min: TEXT_CONTRAST_MIN },
    { fg: tone, bg: 'paper', where: `a ${tone} inline message on the page`, min: TEXT_CONTRAST_MIN },
  ]),
]

const NON_TEXT_PAIRS: Pair[] = [
  { fg: 'focus', bg: 'paper', where: 'the focus outline on the page', min: NON_TEXT_CONTRAST_MIN },
  { fg: 'focus', bg: 'surface', where: 'the focus outline on a card', min: NON_TEXT_CONTRAST_MIN },
  // The dial strokes are painted at full opacity, so every tone must survive on
  // every tint — not just its own. No colour is the only signal (word + icon).
  ...TONES.flatMap((tone) =>
    TONES.map((other) => ({
      fg: tone,
      bg: `${other}-tint`,
      where: `the ${tone} dial arc on the ${other} tint`,
      min: NON_TEXT_CONTRAST_MIN,
    })),
  ),
]

function ratio(pair: Pair): number | null {
  const fg = TOKENS.get(pair.fg)
  const bg = TOKENS.get(pair.bg)
  if (!fg || !bg) return null
  return contrastTokenPair(fg, bg)
}

function describePair(pair: Pair): string {
  const fg = TOKENS.get(pair.fg) ?? 'missing'
  const bg = TOKENS.get(pair.bg) ?? 'missing'
  const fgHex = parseOklch(fg) ? hexOf(oklchToSrgb(parseOklch(fg)!)) : '—'
  const bgHex = parseOklch(bg) ? hexOf(oklchToSrgb(parseOklch(bg)!)) : '—'
  return `${pair.fg} ${fgHex} on ${pair.bg} ${bgHex} — ${pair.where}`
}

describe('the colour tokens', () => {
  it('are parsed out of the stylesheet, not copied into this file', () => {
    expect(TOKENS.size).toBeGreaterThanOrEqual(20)
    for (const name of ['paper', 'paper-sunk', 'surface', 'ink', 'ink-muted', 'ink-faint', 'focus']) {
      expect(TOKENS.has(name), `--color-${name} is missing from app/globals.css`).toBe(true)
    }
  })

  it('convert to the sRGB hex a browser would paint', () => {
    // Pins the Oklab matrices: if the conversion drifts, every ratio below drifts
    // with it, so the conversion itself is checked against the known values.
    expect(hexOf(oklchToSrgb(parseOklch('0.986 0.006 85')!))).toBe('#fcfaf6')
    expect(hexOf(oklchToSrgb(parseOklch('1 0 0')!))).toBe('#ffffff')
    expect(hexOf(oklchToSrgb(parseOklch('0.21 0.012 60')!))).toBe('#1d1713')
  })
})

describe('R14.1 — every text pair clears WCAG AA', () => {
  for (const pair of TEXT_PAIRS) {
    it(`${pair.fg} on ${pair.bg} (${pair.where})`, () => {
      const measured = ratio(pair)
      expect(measured, describePair(pair)).not.toBeNull()
      expect(measured!, `${describePair(pair)} measured ${measured!.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.min)
    })
  }

  it('holds every pair to 4.5 even where 3.0 would be allowed', () => {
    // 22px medium is not "large" by WCAG (that needs 24px, or 18.66px bold), so a
    // size-based allowance would be a mistake this test refuses to make.
    expect(textMinimum({ px: 22, bold: false })).toBe(TEXT_CONTRAST_MIN)
    expect(textMinimum({ px: 24 })).toBe(LARGE_TEXT_CONTRAST_MIN)
    expect(textMinimum({ px: 18.66, bold: true })).toBe(LARGE_TEXT_CONTRAST_MIN)
  })
})

describe('R14.1 — the verdict tones are visible without being the only signal', () => {
  for (const pair of NON_TEXT_PAIRS) {
    it(`${pair.fg} on ${pair.bg} (${pair.where})`, () => {
      const measured = ratio(pair)
      expect(measured, describePair(pair)).not.toBeNull()
      expect(measured!, `${describePair(pair)} measured ${measured!.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.min)
    })
  }

  it('keeps the three verdict tones far enough apart in the palette', () => {
    // Not a WCAG rule: a sanity check that "switch", "deadline" and "hold" are
    // different colours, so a reader who can see colour sees three states.
    for (const [index, first] of (['switch', 'deadline', 'hold'] as const).entries()) {
      const second = (['switch', 'deadline', 'hold'] as const)[index + 1]
      if (!second) continue
      const a = TOKENS.get(first)!
      const b = TOKENS.get(second)!
      const aHex = hexOf(oklchToSrgb(parseOklch(a)!))
      const bHex = hexOf(oklchToSrgb(parseOklch(b)!))
      expect(aHex).not.toBe(bHex)
    }
  })
})

describe('R14.1 — the one translucent surface still passes', () => {
  it('the sticky header stays readable over the darkest thing it scrolls across', () => {
    // `bg-paper/85` over whatever is beneath it: the darkest token in the palette
    // is `ink`, so that is the worst case. Mixed in linear light, as the browser
    // does, then measured with the same ratio as every other pair.
    const paper = tokenToSrgb(TOKENS.get('paper')!)!
    const ink = tokenToSrgb(TOKENS.get('ink')!)!
    const muted = tokenToSrgb(TOKENS.get('ink-muted')!)!
    const inkText = tokenToSrgb(TOKENS.get('ink')!)!

    const header = blendOver(paper, 0.85, ink)
    expect(contrastRatio(inkText, header)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN)
    expect(contrastRatio(muted, header)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN)
  })
})

describe('contrastFromHex', () => {
  it('matches the WCAG reference values for black and white', () => {
    expect(contrastFromHex('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastFromHex('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // A documented AA boundary: #767676 on white is the classic 4.54:1 grey.
    expect(contrastFromHex('#767676', '#ffffff')).toBeCloseTo(4.54, 1)
    expect(parseHex('#fff')).not.toBeNull()
    expect(contrastFromHex('not-a-colour', '#ffffff')).toBeNull()
  })
})
