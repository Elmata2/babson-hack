/**
 * @built F-123 the disclosure, in one place, so the prompt, the tests and the demo cannot drift
 *
 * `.kiro/steering/voice-agent-rules.md` fixes the first sentence of every call and
 * says changing it is a spec change, not a copy edit. CI asserts it. So the text
 * lives here as a template, `agents/quote-caller/first-message.txt` carries the
 * same words for the platform, and `agents/__tests__/contract.test.ts` fails if the
 * two ever disagree.
 *
 * ADR-011 is the other half of the sentence: the agent asks and reports. It never
 * agrees to buy, book or pay, and never claims to be a person.
 */

/** The two variables the platform fills in. Anything else in brackets is a bug. */
export const DISCLOSURE_VARIABLES = ['town', 'fuel'] as const

/** Verbatim from the steering file. `{town}` and `{fuel}` are the only holes. */
export const DISCLOSURE_TEMPLATE =
  "Hi, this is an automated AI assistant calling on behalf of a homeowner in {town}. This call is recorded and transcribed. I'd like to ask a few quick questions about your {fuel} prices. Is that OK?"

/**
 * The first sentence, for a given household.
 * Guarantee: an unknown variable is left as `{name}` rather than replaced with
 * "undefined", so a prompt bug is visible in the transcript instead of silent.
 */
export function disclosureFor(variables: { town: string; fuel: string }): string {
  return DISCLOSURE_TEMPLATE.replace('{town}', variables.town).replace('{fuel}', variables.fuel)
}

/** What CI asserts about any prompt file, in words: AI, recording, and a question. */
export const DISCLOSURE_CHECKS = [
  'automated AI assistant',
  'recorded and transcribed',
  'Is that OK?',
] as const
