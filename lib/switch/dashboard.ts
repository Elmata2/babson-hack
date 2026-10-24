/**
 * @built F-150 the dashboard's state machine, kept out of the component
 *
 * The dashboard has to answer three questions for every stored request: what did
 * the household choose, how far did the agent get, and what is the one next thing
 * to do? Those are pure functions of the stored record, so the screen cannot
 * disagree with the tests and a stale stage cannot render as a promise.
 */

import { CHOICE_COPY } from './choices'
import { STAGE_COPY } from './session'
import type { StoredSwitch, SwitchStage } from './types'
import { VERDICT_META } from '../verdicts'
import type { Verdict } from '../calc/types'
import { switchHref } from '../verdict/recommendation'
import { shareableQuery, verdictPath } from '../verdict/share-query'
import { withUnitPrice } from '../intake/params'

export type DashboardActionKind = 'primary' | 'secondary'

export interface DashboardAction {
  label: string
  href: string
  kind: DashboardActionKind
}

export interface DashboardStep {
  stage: SwitchStage
  label: string
  copy: string
}

export interface DashboardNext {
  eyebrow: string
  title: string
  body: string
  action: DashboardAction | null
  secondary: DashboardAction | null
  tone: 'switch' | 'deadline' | 'hold' | 'plain'
}

/** A human label for the stored verdict, never the raw enum. */
export function verdictLabel(verdict: string): string {
  return VERDICT_META[verdict as Verdict]?.label ?? 'Not recorded'
}

/** The choice in words, never the enum. */
export function choiceLabel(request: Pick<StoredSwitch, 'choice'>): string {
  return CHOICE_COPY[request.choice]?.label ?? 'Your request'
}

/**
 * What the timeline should show. A kit request is one task, not a six-step
 * journey; a stay or supply decision has no agent run to tick through.
 */
export function dashboardSteps(request: StoredSwitch): { steps: DashboardStep[]; current: number } {
  if (request.stage === 'kit') {
    return {
      steps: [{ stage: 'kit', label: 'Switch kit', copy: STAGE_COPY.kit }],
      current: 0,
    }
  }

  if (request.choice === 'STAY' || request.choice === 'SHOP_SUPPLY') {
    return {
      steps: [
        {
          stage: 'decided',
          label: request.choice === 'STAY' ? 'You stayed' : 'You checked your supply',
          copy:
            request.choice === 'STAY'
              ? 'You chose to stay with what you have. Nothing was sent to a provider.'
              : 'You compared your supply line with Basic Service. No call was placed.',
        },
      ],
      current: 0,
    }
  }

  const steps: DashboardStep[] = [
    { stage: 'consented', label: 'Consent', copy: STAGE_COPY.consented },
    { stage: 'contacting', label: 'The agent calls', copy: STAGE_COPY.contacting },
    { stage: 'quotes_ready', label: 'Quotes back', copy: STAGE_COPY.quotes_ready },
    { stage: 'decided', label: 'Your decision', copy: STAGE_COPY.decided },
  ]

  if (request.stage === 'introduced' || request.stage === 'switched') {
    steps.push({ stage: request.stage, label: 'Introduced', copy: STAGE_COPY[request.stage] })
  }

  const order: SwitchStage[] = ['consented', 'contacting', 'quotes_ready', 'decided', 'introduced', 'switched']
  const current = Math.max(0, order.indexOf(request.stage))
  return { steps, current: Math.min(current, steps.length - 1) }
}

export interface NextInput {
  request: StoredSwitch | null
  /** A completed profile, when the browser has one. */
  profile: { town: string | null; verdictHref: string | null } | null
  demo: boolean
}

function demoHref(href: string, demo: boolean): string {
  if (!demo) return href
  return href.includes('demo=1') ? href : `${href}${href.includes('?') ? '&' : '?'}demo=1`
}

/** The one thing to do next, in the order the product promises it. */
export function dashboardNext({ request, profile, demo }: NextInput): DashboardNext {
  if (!request) {
    if (profile?.verdictHref) {
      return {
        eyebrow: 'Next step',
        title: 'Your verdict is ready.',
        body: 'The numbers from your bills are still in this browser. Reopen the answer, then let the agent get quotes if it says switch.',
        action: { label: 'See your verdict', href: demoHref(profile.verdictHref, demo), kind: 'primary' },
        secondary: { label: 'Update your bills', href: demoHref('/onboarding', demo), kind: 'secondary' },
        tone: 'switch',
      }
    }
    return {
      eyebrow: 'Next step',
      title: profile ? 'Add your bills to get the answer.' : 'Start with your two bills.',
      body: profile
        ? 'The profile has a name and an email. The house needs a year of heating and electricity use before the verdict can price anything.'
        : 'A name and an email, then a photo of two bills. The answer takes about two minutes, and nothing is sent to a server.',
      action: { label: 'Add your bills', href: demoHref('/onboarding', demo), kind: 'primary' },
      secondary: null,
      tone: 'plain',
    }
  }

  const query = request.query
  const verdict = request.verdict as Verdict

  if (request.stage === 'kit') {
    const canAgent = verdict === 'SWITCH_NOW' || verdict === 'SWITCH_BEFORE_DEC31'
    return {
      eyebrow: 'Next step',
      title: 'You have the kit. The agent can do the calling.',
      body: canAgent
        ? 'Nothing was sent. If you would rather not make the calls yourself, the agent can contact two installers with only the facts you have already seen.'
        : 'Nothing was sent. The kit has the exact question and the numbers to call yourself.',
      action: canAgent
        ? { label: 'Let the agent call', href: demoHref(switchHref(query, 'SWITCH_HEAT_PUMP', 'agent'), demo), kind: 'primary' }
        : { label: 'Reopen the kit', href: demoHref(switchHref(query, request.choice, 'kit'), demo), kind: 'primary' },
      secondary: canAgent
        ? { label: 'Open the kit instead', href: demoHref(switchHref(query, request.choice, 'kit'), demo), kind: 'secondary' }
        : { label: 'See the arithmetic', href: demoHref(verdictPath(query), demo), kind: 'secondary' },
      tone: 'plain',
    }
  }

  if (request.stage === 'consented') {
    const canResume = request.agent?.channel === 'phone' && request.agent.mode !== 'off'
    return {
      eyebrow: 'Next step',
      title: canResume ? 'The approval is saved. Start the agent.' : 'The approval is saved.',
      body: canResume
        ? 'You have read the facts and the provider list. One press starts the calls; nothing else is shared.'
        : 'You have read the facts and the provider list. This deployment cannot place the call, so the consent screen is where the kit and the exact question live.',
      action: {
        label: canResume ? 'Resume the agent' : 'Reopen the consent screen',
        href: demoHref(
          canResume ? switchHref(query, request.choice, 'agent') : switchHref(query, request.choice),
          demo,
        ),
        kind: 'primary',
      },
      secondary: {
        label: 'Open the switch kit',
        href: demoHref(switchHref(query, request.choice, 'kit'), demo),
        kind: 'secondary',
      },
      tone: 'switch',
    }
  }

  if (request.stage === 'contacting') {
    return {
      eyebrow: 'Agent working',
      title: 'The agent is contacting the providers.',
      body:
        request.agent?.mode === 'demo'
          ? 'Demo mode: the conversations are replayed for the demo. Nothing leaves this browser.'
          : 'The calls or emails are out. Leave this tab open to keep the statuses; the full board is on the switch screen.',
      action: { label: 'Watch the calls', href: demoHref(switchHref(query, request.choice), demo), kind: 'primary' },
      secondary: null,
      tone: 'switch',
    }
  }

  if (request.stage === 'quotes_ready') {
    const best = request.quotes?.best ?? null
    const isFuel = request.quotes?.kind === 'fuel'
    const bestHref =
      isFuel && best?.unit !== null && best?.unit !== undefined
        ? `/verdict?${withUnitPrice(shareableQuery(query).toString(), best.unit)}`
        : switchHref(query, request.choice)
    return {
      eyebrow: 'Quotes ready',
      title: best
        ? `${best.providerName} has the best comparable number.`
        : 'The quotes are back.',
      body: best
        ? isFuel
          ? 'Use the price to recompute the verdict on the same arithmetic. A cheaper gallon can change the answer, and that is the product working.'
          : 'The ballpark is a total install, not a contract. Reopen the comparison to read the sentence behind every number.'
        : 'The calls came back without a usable price. The switch kit still has the question to ask.',
      action: { label: isFuel ? 'Use the best price' : 'Reopen the comparison', href: demoHref(bestHref, demo), kind: 'primary' },
      secondary: { label: 'Ask for another round', href: demoHref(switchHref(query, request.choice, 'agent'), demo), kind: 'secondary' },
      tone: 'switch',
    }
  }

  // decided / introduced / switched
  if (request.choice === 'STAY') {
    return {
      eyebrow: 'You chose to stay',
      title: 'Nothing changes today. Here is the tripwire.',
      body: 'The January rebate and the next Basic Service reset are the two dates that would move the answer. Keep the reminder in your calendar.',
      action: { label: 'See what would change it', href: demoHref(verdictPath(query), demo), kind: 'primary' },
      secondary: { label: 'Add a January reminder', href: demoHref(verdictPath(query), demo), kind: 'secondary' },
      tone: 'hold',
    }
  }

  if (request.choice === 'SHOP_SUPPLY') {
    return {
      eyebrow: 'Supply checked',
      title: 'Your supply line has been compared.',
      body: 'No call was placed: supply offers are published. Reopen the comparison when the rate resets, or when your contract ends.',
      action: { label: 'Reopen the supply comparison', href: demoHref(switchHref(query, 'SHOP_SUPPLY'), demo), kind: 'primary' },
      secondary: { label: 'See the arithmetic', href: demoHref(verdictPath(query), demo), kind: 'secondary' },
      tone: 'plain',
    }
  }

  return {
    eyebrow: 'Decision saved',
    title:
      request.decision?.outcome === 'contacting'
        ? 'You are following up with the provider.'
        : 'You chose to pause.',
    body:
      request.decision?.outcome === 'contacting'
        ? 'The quotes stay in this tab. Use the best number when you are ready, or ask the agent for another round.'
        : 'Nothing was sent. The numbers and the agent action are still here if you change your mind.',
    action: { label: 'Reopen the call results', href: demoHref(switchHref(query, request.choice), demo), kind: 'primary' },
    secondary: { label: 'Let the agent try again', href: demoHref(switchHref(query, request.choice, 'agent'), demo), kind: 'secondary' },
    tone: 'plain',
  }
}

/** What the last decision means in words, for the small footer line. */
export function decisionCopy(request: StoredSwitch): string | null {
  const decision = request.decision
  if (!decision) return null
  if (request.choice === 'STAY') return 'You chose to stay as you are.'
  if (decision.outcome === 'checked') return 'You compared your supply line with Basic Service.'
  if (decision.outcome === 'declined') return 'You chose not to send the request.'
  return 'You are following up with the provider yourself.'
}
