/**
 * @built F-42 colours the map needs as literals
 *
 * MapLibre's colour parser does not read `oklch()`, so the heat ramp tokens in
 * `app/globals.css` are restated here as their sRGB equivalents (computed from the
 * oklch values, rounded). If a `--color-heat-*` token changes, change it here too.
 */

import type { SponsorKey } from '@/lib/elec-label'

/** --color-heat-1 … --color-heat-5, as hex. */
export const HEAT_RAMP = ['#f7efda', '#f0d5ac', '#e8ab70', '#d3793c', '#ac451c'] as const

/** Class breaks for oil share: below the first is class 1, and so on. */
export const HEAT_BREAKS = [0.05, 0.15, 0.3, 0.5] as const
export const HEAT_LABELS = ['Under 5%', '5 to 15%', '15 to 30%', '30 to 50%', '50% or more'] as const

/** A tract with no occupied households or no estimate. */
export const NO_DATA = '#d9d6cf'

/** Equity overlay: neutral violet, drawn at 25% so it never reads as a heat value. */
export const EJ_VIOLET = '#7c5cc7'
export const EJ_OPACITY = 0.25

/** Provider colours on the dark Energy basemap. */
export const PROVIDER_COLOUR: Record<SponsorKey | 'mixed', string> = {
  eversource: '#3fa7ff',
  nationalgrid: '#9b8cff',
  unitil: '#f28c6b',
  municipal: '#2fd3b5',
  cape_light: '#e879b9',
  other: '#6b7a90',
  mixed: '#c9d4e5',
}

export const ENERGY_BG = '#0b1220'
export const LIGHT_BG = '#f4f1ea'
export const SOLAR_COLOUR = '#ffd166'
