/**
 * @built F-43 F-45 F-47 F-48 the heat panels render without a browser.
 *
 * There is no DOM harness in this repository, so these components are server-rendered
 * here: that catches a broken conditional, a missing figure, and — the bug this test
 * was written after — a price rounded to the dollar by the wrong formatter. It is
 * not a substitute for looking at the map; it is the cheap half of the check.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HeatControls } from '@/components/map/heat-controls'
import { YEAR_TOGGLE_NOTE } from '@/lib/map/heat'
import { HeatTable } from '@/components/map/heat-table'
import { HeatStatic } from '@/components/map/heat-static'
import { BillPanel } from '@/components/map/bill-panel'
import { EMPTY_PROFILE } from '@/components/map/types'
import { TownPanel } from '@/components/map/town-panel'
import type { EnergyTown } from '@/lib/map/energy-model'

const noop = () => {}

describe('the heat panels', () => {
  it('render the switcher, the year toggle, the legend and the assumption', () => {
    const html = renderToStaticMarkup(
      createElement(HeatControls, {
        metric: 'cliff_dollars',
        onMetric: noop,
        year: 2027,
        onYear: noop,
        ejOn: true,
        onEj: noop,
        onTable: noop,
        onStatic: noop,
        tractsReady: true,
      }),
    )
    expect(html).toContain('Install in 2026')
    expect(html).toContain('Wait until 2027')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('type="range"')
    expect(html).toContain(YEAR_TOGGLE_NOTE)
    expect(YEAR_TOGGLE_NOTE).toBe(
      'The rebate cap drops from $8,500 to $7,500 on 1 January 2027 — this shows what oil-heated homes would lose by waiting.',
    )
    expect(html).toContain('Most you could lose')
    expect(html).toContain('Up to $1,000 per oil-heated home: the 2026 cap minus the 2027 cap. Smaller systems lose less.')
    expect(html).toContain('assumes 750 gal/household')
    // The dated DOER price keeps its cents: $6/gal would be a different number.
    expect(html).toContain('$6.23/gal')
    expect(html).toContain('$8,500')
    expect(html).toContain('Table view')
    // R10.13: the county figures are on screen before the tract layer exists.
    expect(html).toContain('Counties, now')
    expect(html).toContain('Massachusetts ·')
  })

  it('render the table with the county roll-up and a Massachusetts total', () => {
    const html = renderToStaticMarkup(
      createElement(HeatTable, {
        open: true,
        onClose: noop,
        year: 2027,
        town: 'Wellesley',
        selected: null,
        onSelect: noop,
      }),
    )
    expect(html).toContain('Heating oil by census tract')
    expect(html).toContain('Counties')
    expect(html).toContain('Massachusetts')
    expect(html).toContain('assumes 750 gal/household')
  })

  it('close the table when it is not open', () => {
    expect(
      renderToStaticMarkup(
        createElement(HeatTable, { open: false, onClose: noop, year: 2027, town: null, selected: null, onSelect: noop }),
      ),
    ).toBe('')
  })

  it('render the tract panel with every R10.4 figure and the seed button', () => {
    const html = renderToStaticMarkup(
      createElement(TownPanel, { town: 'Wellesley', tract: '25017383402', onClearTract: noop, ejOn: true, year: 2027 }),
    )
    expect(html).toContain('Use this tract')
    expect(html).toContain('Most lost on Jan 1, 2027')
    expect(html).toContain('Median year built')
    expect(html).toContain('assumes 750 gal/household')
    expect(html).toContain('Equity lens')
  })

  it('render the static fallback pointing at the committed SVG and the table', () => {
    const html = renderToStaticMarkup(
      createElement(HeatStatic, { open: true, onClose: noop, onTable: noop, reason: null }),
    )
    expect(html).toContain('ma-heat-map.png')
    expect(html).toContain('Open the table view')
  })

  it('name a municipal light plant plainly in the utility line (R10.10)', () => {
    // Raynham is served by a municipal light plant and nothing else. (Wellesley
    // is too — the panel's own text says so, which is why it is not the example.)
    const html = renderToStaticMarkup(
      createElement(TownPanel, { town: 'Raynham', tract: null, onClearTract: noop, ejOn: false, year: 2026 }),
    )
    expect(html).toContain('Electric utility')
    expect(html).toContain('Municipal light plant — Mass Save rebates do not apply')
  })

  it('asks which utility bills a mixed town instead of guessing (R10.10)', () => {
    const html = renderToStaticMarkup(
      createElement(TownPanel, { town: 'Lakeville', tract: null, onClearTract: noop, ejOn: false, year: 2026 }),
    )
    expect(html).toContain('Which one bills you')
  })

  it('names the Mass Save sponsor for an investor-owned town', () => {
    const html = renderToStaticMarkup(
      createElement(TownPanel, { town: 'Newton', tract: null, onClearTract: noop, ejOn: false, year: 2026 }),
    )
    expect(html).toContain('Eversource, a Mass Save sponsor')
  })

  it('compares your kWh with the average home in the town and hides the average where it means nothing', () => {
    const baked = () =>
      ({
        sources: {
          usage: { label: 'Mass Save', url: '', year: 2023, units: '', note: '' },
          households: { label: 'Census ACS 5-year', url: '', year: 2023, period: '', units: '', note: '' },
          solar: { label: 'MassCEC', url: '', asOf: '2025-01-14', units: '', note: '' },
        },
      }) as never
    const energy = (usage: EnergyTown['usage'], sponsors: EnergyTown['sponsors']) =>
      ({
        source: 'WORCESTER',
        town: 'Worcester',
        county: 'Worcester',
        centroid: [0, 0],
        sponsors,
        zone: 'WCMA',
        mixed: sponsors.length > 1,
        provider: sponsors[0],
        usage,
        solarMW: 40,
        solarSystems: 2653,
        incentivesUsd: 5915254,
        households: 79089,
      }) as EnergyTown
    const render = (e: EnergyTown, yourKwh: number | null) =>
      renderToStaticMarkup(
        createElement(TownPanel, { town: 'Worcester', tract: null, onClearTract: noop, ejOn: false, year: 2026, energy: e, meta: baked(), yourKwh }),
      )
    const ok = render(energy({ status: 'reported', mwh: 406178 }, ['eversource']), 650)
    expect(ok).toContain('You: 650 kWh/month')
    expect(ok).toContain('Average home in Worcester: 428 kWh/month')
    expect(ok).toContain('You use roughly 52% more than the average home in Worcester.')
    expect(ok).toContain('Mass Save 2023 ÷ Census ACS 5-yr households')
    expect(ok).toContain('A rough guide, not an exact average: each per household figure')
    expect(ok).toContain('Towns with many apartments read low; towns with many seasonal homes read high.')
    expect(ok).toContain('received $5,915,254')
    expect(ok).toContain('Mass Save paid about $75 per household in Worcester in 2023 for residential electric programs.')
    expect(ok).toContain('(Mass Save 2023 ÷ Census ACS households)')
    const seasonal = render({ ...energy({ status: 'reported', mwh: 406178 }, ['eversource']), households: 20000 }, 650)
    expect(seasonal).toContain('You: 650 kWh/month')
    expect(seasonal).toContain('Average home in Worcester: 1,692 kWh/month')
    expect(seasonal).toContain('Seasonal homes push this town&#x27;s average up, so compare loosely.')
    expect(seasonal).not.toContain('You use')
    expect(render(energy({ status: 'reported', mwh: 406178 }, ['eversource']), null)).toContain('Add your monthly kWh to compare')
    const none = render({ ...energy({ status: 'reported', mwh: 406178 }, ['eversource']), incentivesUsd: 0 }, 650)
    expect(none).toContain('No Mass Save incentives reported in 2023.')
    expect(none).not.toContain('per household in')
    expect(none).not.toContain('about $0')
    const municipal = render(energy({ status: 'municipal' }, ['municipal']), 650)
    expect(municipal).toContain('no average home to compare')
    expect(municipal).not.toContain('per household in')
    expect(render(energy({ status: 'suppressed' }, ['eversource']), 650)).not.toContain('per household in')
    expect(render({ ...energy({ status: 'reported', mwh: 1 }, ['eversource']), incentivesUsd: null }, 650)).not.toContain('per household in')
    expect(render(energy({ status: 'reported', mwh: 1 }, ['eversource', 'nationalgrid']), 650)).not.toContain('per household in')
    expect(render(energy({ status: 'reported', mwh: 1 }, ['eversource', 'nationalgrid']), 650)).toContain('more than one utility')
  })

  it('offers the way back to the verdict and no grid clock', () => {
    const html = renderToStaticMarkup(
      createElement(TownPanel, { town: 'Newton', tract: null, onClearTract: noop, ejOn: false, year: 2026, backHref: '/verdict?fuel=propane' }),
    )
    expect(html).toContain('href="/verdict?fuel=propane"')
    expect(html).toContain('← Back to your verdict')
    expect(html).not.toContain('Grid')
  })
})

describe('the Your bill tab', () => {
  const render = (patch: Partial<typeof EMPTY_PROFILE>) =>
    renderToStaticMarkup(createElement(BillPanel, { profile: { ...EMPTY_PROFILE, ...patch }, onEditProfile: noop, today: new Date('2026-10-24') }))

  it('asks for My home only when nothing was entered', () => {
    expect(render({})).toContain('Fill in My home')
    expect(render({ kwh: 600, kwhIsExample: true })).toContain('Fill in My home')
  })

  it('renders from a stored kWh alone, without the empty-state prompt', () => {
    const html = render({ kwh: 540, kwhIsExample: false })
    expect(html).not.toContain('Fill in My home')
    expect(html).toContain('What you entered')
    expect(html).toContain('540 kWh')
  })

  it('renders the full bill from onboarding fields', () => {
    const html = render({ town: 'Worcester', kwh: 540, kwhIsExample: false, fuel: 'oil', supply: 'competitive', supplierRateCents: 18, contractEnd: '2027-02-01' })
    expect(html).not.toContain('Fill in My home')
    expect(html).toContain('Heating oil')
    expect(html).toContain('Your supply vs Basic Service')
    expect(html).toContain('Rebate deadline')
  })
})
