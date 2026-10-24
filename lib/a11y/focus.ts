/**
 * @built F-50 R14.2 — the drawer's open/close decision, as a pure function
 *
 * The provenance drawer is a native `<dialog>`: the platform owns the focus trap,
 * the Escape key and returning focus to the button that opened it. The one piece
 * of the contract a component can get wrong is *when* to call `showModal()` and
 * `close()` — calling either twice, or leaving the element and the React state out
 * of step, is how a dialog ends up unreachable or un-closable. That decision is
 * four combinations, so it lives here and is tested directly instead of being
 * buried in an effect that needs a DOM to exercise.
 */

/** What to do to the dialog element for a given (element state, desired state). */
export type DialogAction = 'show' | 'close' | 'none'

/**
 * `isOpen` is the element's own `open` property; `shouldOpen` is React state.
 * Guarantee: `show` only when closed, `close` only when open, so a re-render never
 * re-enters modal mode or steals focus twice.
 */
export function dialogAction(isOpen: boolean, shouldOpen: boolean): DialogAction {
  if (shouldOpen && !isOpen) return 'show'
  if (!shouldOpen && isOpen) return 'close'
  return 'none'
}

/** The id a figure's dialog uses, so the trigger and the heading cannot disagree. */
export function provenanceDialogId(figureId: string): string {
  return `provenance-${figureId}`
}
