/**
 * @built F-131 R23.2 — the model reads a number back; code is the only thing that computes it
 *
 * An inbound caller asks "should I switch?" in English, Spanish, Portuguese or
 * Haitian Creole, and the answer has to be the same arithmetic the web screen runs.
 * So the tool returns finished sentences per language, and the prompt forbids the
 * agent from editing a figure. Four languages, four templates, one set of numbers.
 *
 * The disclaimer is part of the line, not a separate nicety: R15.2 says every
 * verdict carries it, and a phone answer is a verdict.
 */

import type { Verdict } from '../calc/types'

export type VoiceLang = 'en' | 'es' | 'pt' | 'ht'

/** R23.1: the four languages, in the order the requirement lists them. */
export const VOICE_LANGS: readonly VoiceLang[] = ['en', 'es', 'pt', 'ht']

export function parseVoiceLang(raw: string | null | undefined): VoiceLang | null {
  return VOICE_LANGS.find((lang) => lang === raw) ?? null
}

export interface VerdictLineInput {
  verdict: Verdict
  /** Signed dollars a year. Negative is a loss and is said as one. */
  annualSavings: number
  /** Null when there is no payback because savings are not positive. */
  paybackYears: number | null
  /** Cents per kWh at which savings reach zero, when that number exists. */
  breakEvenCents: number | null
  /** Dollars the rebate loses on 2027-01-01, for the before-December verdict. */
  rebateDrop: number
}

function dollars(value: number): string {
  return `$${Math.abs(Math.round(value)).toLocaleString('en-US')}`
}

const DISCLAIMER: Record<VoiceLang, string> = {
  en: 'This is an estimate, not a quote. A Home Energy Assessment decides eligibility and sizing.',
  es: 'Esto es una estimación, no una cotización. Una evaluación energética gratuita decide la elegibilidad y el tamaño.',
  pt: 'Isto é uma estimativa, não um orçamento. Uma avaliação energética gratuita decide a elegibilidade e o dimensionamento.',
  ht: 'Sa se yon estimasyon, se pa yon pri. Yon evalyasyon enèji gratis ki deside si ou kalifye ak gwosè sistèm nan.',
}

/**
 * The sentence the agent reads, verbatim.
 * Guarantee: a loss is never softened into a gain, and a positive saving always
 * carries the payback year or the sentence says there is none.
 */
export function verdictLine(input: VerdictLineInput, lang: VoiceLang): string {
  const saving = dollars(input.annualSavings)
  const payback = input.paybackYears === null ? null : input.paybackYears.toFixed(1)
  const breakEven = input.breakEvenCents === null ? null : input.breakEvenCents.toFixed(1)

  switch (input.verdict) {
    case 'SWITCH_NOW':
      return lang === 'es'
        ? `Sí: una bomba de calor le ahorraría unos ${saving} al año${payback ? `, y se paga sola en ${payback} años` : ''}.`
        : lang === 'pt'
          ? `Sim: uma bomba de calor economizaria cerca de ${saving} por ano${payback ? `, e se paga em ${payback} anos` : ''}.`
          : lang === 'ht'
            ? `Wi: yon ponp chalè ta ekonomize apeprè ${saving} chak ane${payback ? `, epi li peye tèt li nan ${payback} an` : ''}.`
            : `Yes: a heat pump would save about ${saving} a year${payback ? `, and it pays for itself in ${payback} years` : ''}.`

    case 'SWITCH_BEFORE_DEC31': {
      const drop = dollars(input.rebateDrop)
      return lang === 'es'
        ? `Conviene cambiar antes del 31 de diciembre: el reembolso baja ${drop} el 1 de enero. El ahorro anual es de unos ${saving}.`
        : lang === 'pt'
          ? `Vale a pena trocar antes de 31 de dezembro: o reembolso cai ${drop} em 1º de janeiro. A economia anual é de cerca de ${saving}.`
          : lang === 'ht'
            ? `Li vo chanje anvan 31 desanm: ranbousman an desann ${drop} nan 1ye janvye. Ekonomi anyèl la se anviwon ${saving}.`
            : `Worth switching before December 31: the rebate drops ${drop} on January 1. The annual saving is about ${saving}.`
    }

    case 'DO_NOT_SWITCH_YET':
    default:
      return lang === 'es'
        ? `Todavía no. A estos precios una bomba de calor no le ahorraría dinero${breakEven ? `: la electricidad tendría que costar menos de ${breakEven} centavos por kWh` : ''}.`
        : lang === 'pt'
          ? `Ainda não. Com estes preços uma bomba de calor não economizaria dinheiro${breakEven ? `: a eletricidade teria de custar menos de ${breakEven} centavos por kWh` : ''}.`
          : lang === 'ht'
            ? `Poko. Nan pri sa yo yon ponp chalè p ap ekonomize lajan${breakEven ? `: elektrisite ta dwe koute mwens pase ${breakEven} santim pou chak kWh` : ''}.`
            : `Not yet. At these prices a heat pump would not save you money${breakEven ? `: electricity would have to cost under ${breakEven} cents a kWh` : ''}.`
  }
}

export function disclaimerLine(lang: VoiceLang): string {
  return DISCLAIMER[lang]
}

/** The one thing the agent says if it is asked to decide for the caller (ADR-011). */
export function decisionLine(lang: VoiceLang): string {
  return lang === 'es'
    ? 'La decisión es suya; yo solo doy el número.'
    : lang === 'pt'
      ? 'A decisão é sua; eu só dou o número.'
      : lang === 'ht'
        ? 'Desizyon an se pou ou; mwen bay chif la sèlman.'
        : 'The decision is yours; I only give you the number.'
}
