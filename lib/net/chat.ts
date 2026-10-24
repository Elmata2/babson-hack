/**
 * @built F-39 text-only chat transport — one provider decision, three readers
 *
 * `/api/explain` needs prose, not vision. It shares the deployment's credentials
 * with `/api/parse-bill` but not its request shape: no images, a short prompt, an
 * 8s deadline. The route treats every failure here as "use the fallback", so this
 * module returns typed outcomes rather than throwing.
 *
 * This is deliberately separate from the vision reader. `claude-sonnet-5` on the
 * gateway rejects `temperature`, and OpenRouter speaks the OpenAI chat shape, so
 * the two shapes are decided once, here, from the provider name.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const BABSON_DEFAULT_URL = 'https://ca-litellm-mint-eus2.orangeflower-5d81efa8.eastus2.azurecontainerapps.io'
const BABSON_DEFAULT_MODEL = 'claude-sonnet-5'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_DEFAULT_MODEL = 'google/gemma-3-12b-it'

export type ChatProviderName = 'babson' | 'anthropic' | 'openrouter'

export interface ChatProvider {
  name: ChatProviderName
  key: string
  /** Anthropic-shaped endpoint, except for OpenRouter. */
  url: string
  model: string
}

export interface ChatOutcome {
  ok: boolean
  text?: string
  code?: string
  message?: string
}

/** Accept a base URL or a full `/v1/messages` endpoint without doubling a path. */
function anthropicEndpoint(base: string): string {
  const trimmed = base.replace(/\/+$/, '')
  if (/\/v1\/messages$/.test(trimmed)) return trimmed
  if (/\/v1$/.test(trimmed)) return `${trimmed}/messages`
  return `${trimmed}/v1/messages`
}

/**
 * The same order as the vision reader: the seminar gateway, a console key, then
 * OpenRouter. A Claude Code OAuth token has no API quota, so it is not a provider
 * — pretending otherwise would turn every explanation into a silent fallback.
 */
export function pickChatProvider(env: NodeJS.ProcessEnv = process.env): {
  provider: ChatProvider | null
  reason: string
} {
  const babson = env.BABSON_GATEWAY_KEY?.trim() ?? ''
  if (babson) {
    return {
      provider: {
        name: 'babson',
        key: babson,
        url: anthropicEndpoint(env.BABSON_GATEWAY_URL?.trim() || BABSON_DEFAULT_URL),
        model: env.BABSON_GATEWAY_MODEL?.trim() || BABSON_DEFAULT_MODEL,
      },
      reason: '',
    }
  }

  const anthropic = env.ANTHROPIC_API_KEY?.trim() ?? ''
  if (anthropic.startsWith('sk-ant-api')) {
    return {
      provider: {
        name: 'anthropic',
        key: anthropic,
        url: ANTHROPIC_URL,
        model: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
      },
      reason: '',
    }
  }

  const openrouter = env.OPENROUTER_API_KEY?.trim() ?? ''
  if (openrouter) {
    return {
      provider: {
        name: 'openrouter',
        key: openrouter,
        url: OPENROUTER_URL,
        model: env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
      },
      reason: '',
    }
  }

  return {
    provider: null,
    reason: anthropic.startsWith('sk-ant-oat')
      ? 'The configured Anthropic credential is a Claude Code OAuth token, which has no API quota.'
      : 'No prose provider is configured; the deterministic explanation is used.',
  }
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string | null } }[]
}

/** Prose from the configured provider. Never throws; every failure is typed. */
export async function chatText(
  provider: ChatProvider,
  prompt: string,
  options: {
    maxTokens?: number
    timeoutMs?: number
    fetchImpl?: typeof fetch
  } = {},
): Promise<ChatOutcome> {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8_000
  const maxTokens = options.maxTokens ?? 400
  const openrouter = provider.name === 'openrouter'

  const headers: Record<string, string> = openrouter
    ? {
        authorization: `Bearer ${provider.key}`,
        'content-type': 'application/json',
        'x-title': 'Switchpoint',
      }
    : {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': provider.key,
      }

  const body = openrouter
    ? {
        model: provider.model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }
    : {
        model: provider.model,
        max_tokens: maxTokens,
        // `claude-sonnet-5` rejects the parameter outright.
        ...(provider.name === 'babson' ? {} : { temperature: 0 }),
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }

  let response: Awaited<ReturnType<typeof fetch>>
  try {
    response = await doFetch(provider.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return { ok: false, code: 'network', message: 'The prose provider is unreachable.' }
  }

  if (!response.ok) {
    return { ok: false, code: 'upstream', message: `The prose provider answered ${response.status}.` }
  }

  let payload: AnthropicResponse | OpenRouterResponse
  try {
    payload = (await response.json()) as AnthropicResponse | OpenRouterResponse
  } catch {
    return { ok: false, code: 'shape', message: 'The prose provider did not answer with JSON.' }
  }

  const text = openrouter
    ? ((payload as OpenRouterResponse).choices?.[0]?.message?.content ?? '')
    : ((payload as AnthropicResponse).content?.find((part) => part.type === 'text')?.text ?? '')

  return text.trim()
    ? { ok: true, text }
    : { ok: false, code: 'empty', message: 'The prose provider returned nothing.' }
}
