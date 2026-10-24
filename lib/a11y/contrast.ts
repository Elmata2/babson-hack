/**
 * @built F-50 R14.1 — contrast, computed from the token values instead of claimed in a comment
 *
 * The design tokens in `app/globals.css` are authored in OKLCH, which is good for
 * perceiving a palette and useless for asserting WCAG. This module converts a
 * token to sRGB exactly the way a browser would (Björn Ottosson's Oklab
 * matrices), then computes the WCAG 2.x contrast ratio from the relative
 * luminance of the two colours.
 *
 * Nothing here is a lookup table of "numbers we measured once". The test reads
 * the real `--color-*` declarations out of the stylesheet, converts them through
 * this module, and asserts the documented pairs. Change a token and the audit
 * changes with it.
 *
 * Pure: no DOM, no filesystem, no network.
 */

/** A colour in gamma-encoded sRGB, each channel 0–1. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/** An OKLCH triple: lightness 0–1, chroma, hue in degrees. */
export interface Oklch {
  l: number
  c: number
  h: number
}

/** WCAG 2.2 thresholds, named so the test reads like the requirement. */
export const TEXT_CONTRAST_MIN = 4.5
export const LARGE_TEXT_CONTRAST_MIN = 3
export const NON_TEXT_CONTRAST_MIN = 3

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

/** Parse `0.44 0.012 60`, with or without a surrounding `oklch(...)`. */
export function parseOklch(value: string): Oklch | null {
  const body = value.trim().replace(/^oklch\(\s*/i, '').replace(/\)\s*$/, '')
  const parts = body.split(/[\s,/]+/).filter((part) => part !== '')
  if (parts.length < 3) return null
  const [l, c, h] = parts.slice(0, 3).map(Number)
  if (![l, c, h].every(Number.isFinite)) return null
  return { l, c, h }
}

/** OKLCH → linear sRGB, then gamma-encoded sRGB. Out-of-gamut channels are clipped. */
export function oklchToSrgb(color: Oklch): Rgb {
  const hue = (color.h * Math.PI) / 180
  const a = color.c * Math.cos(hue)
  const b = color.c * Math.sin(hue)

  const lPrime = color.l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = color.l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = color.l - 0.0894841775 * a - 1.291485548 * b

  const l = lPrime ** 3
  const m = mPrime ** 3
  const s = sPrime ** 3

  const linear = {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }

  const encode = (channel: number): number => {
    const value = clamp(channel)
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  }

  return { r: encode(linear.r), g: encode(linear.g), b: encode(linear.b) }
}

/** The same conversion for a token string, or `null` when the string is not OKLCH. */
export function tokenToSrgb(token: string): Rgb | null {
  const parsed = parseOklch(token)
  return parsed ? oklchToSrgb(parsed) : null
}

/** `#rrggbb`, the form the eye (and a failure message) can check. */
export function hexOf(rgb: Rgb): string {
  const channel = (value: number): string =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/** Parse `#rrggbb` or `#rgb` back to sRGB channels. */
export function parseHex(hex: string): Rgb | null {
  const body = hex.trim().replace(/^#/, '')
  const full = body.length === 3 ? body.split('').map((digit) => `${digit}${digit}`).join('') : body
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const int = Number.parseInt(full, 16)
  return {
    r: ((int >> 16) & 0xff) / 255,
    g: ((int >> 8) & 0xff) / 255,
    b: (int & 0xff) / 255,
  }
}

/** WCAG relative luminance from gamma-encoded sRGB. */
export function relativeLuminance(rgb: Rgb): number {
  const linearise = (channel: number): number => {
    const value = clamp(channel)
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearise(rgb.r) + 0.7152 * linearise(rgb.g) + 0.0722 * linearise(rgb.b)
}

/** The WCAG contrast ratio between two colours. Symmetric, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Ratio between two hex strings, for a test that documents tokens at their nearest sRGB. */
export function contrastFromHex(foreground: string, background: string): number | null {
  const fg = parseHex(foreground)
  const bg = parseHex(background)
  if (!fg || !bg) return null
  return contrastRatio(fg, bg)
}

/** Minimum ratio for a text pair at a given size, straight from WCAG 2.2 AA. */
export function textMinimum(options: { px: number; bold?: boolean }): number {
  // 18pt = 24px; 14pt bold = 18.66px, the same as the requirement's 18.7.
  const large = options.px >= 24 || (options.bold === true && options.px >= 18.66)
  return large ? LARGE_TEXT_CONTRAST_MIN : TEXT_CONTRAST_MIN
}

/** Ratio for two OKLCH token strings, or `null` if either is unparseable. */
export function contrastTokenPair(foreground: string, background: string): number | null {
  const fg = tokenToSrgb(foreground)
  const bg = tokenToSrgb(background)
  if (!fg || !bg) return null
  return contrastRatio(fg, bg)
}

/**
 * Composite `foreground` at `alpha` over `background`, mixed in linear light.
 *
 * Used for the one translucent surface in the app — the sticky header's
 * `bg-paper/85` — which can scroll over anything on the page. Linear-light mixing
 * lands *darker* than the browser's sRGB mixing when a light layer covers a dark
 * one, so the ratio computed here is the conservative one: if the pair passes
 * this, it passes on screen.
 */
export function blendOver(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  const toLinear = (channel: number): number => {
    const value = clamp(channel)
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const toGamma = (channel: number): number => {
    const value = clamp(channel)
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  }
  const mix = (front: number, back: number): number => toGamma(alpha * toLinear(front) + (1 - alpha) * toLinear(back))
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
  }
}
