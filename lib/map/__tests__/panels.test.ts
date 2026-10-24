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
import { HeatTable } from '@/components/map/heat-table'
import { HeatStatic } from '@/components/map/heat-static'
import { TownPanel } from '@/components/map/town-panel'

const noop = () => {}

describe('the heat panels', () => {
  it('render the switcher, the scrubber, the legend and the assumption', () => {
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
    expect(html).toContain('Install year')
    expect(html).toContain('Cliff dollars')
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
    expect(html).toContain('Lost on Jan 1, 2027')
    expect(html).toContain('Median year built')
    expect(html).toContain('assumes 750 gal/household')
    expect(html).toContain('Equity lens')
  })

  it('render the static fallback pointing at the committed SVG and the table', () => {
    const html = renderToStaticMarkup(
      createElement(HeatStatic, { open: true, onClose: noop, onTable: noop, reason: null }),
    )
    expect(html).toContain('ma-heat-map.svg')
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
})
