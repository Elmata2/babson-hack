/**
 * @built F-50 R14.2 — the drawer's open/close decision, tested without a DOM
 *
 * `showModal()` twice throws, and calling it while the element is already open
 * silently re-runs the focusing steps, which can pull focus off the control the
 * reader was about to use. So the four combinations are pinned here, and the
 * component keeps no branching of its own.
 */

import { describe, expect, it } from 'vitest'

import { dialogAction, provenanceDialogId } from '../focus'

describe('dialogAction', () => {
  it('opens a closed dialog that should be open', () => {
    expect(dialogAction(false, true)).toBe('show')
  })

  it('closes an open dialog that should be closed', () => {
    expect(dialogAction(true, false)).toBe('close')
  })

  it('does nothing when the element already agrees with the state', () => {
    expect(dialogAction(true, true)).toBe('none')
    expect(dialogAction(false, false)).toBe('none')
  })
})

describe('provenanceDialogId', () => {
  it('is stable and unique per figure', () => {
    expect(provenanceDialogId('savings')).toBe('provenance-savings')
    expect(provenanceDialogId('savings')).not.toBe(provenanceDialogId('netCost'))
  })
})
