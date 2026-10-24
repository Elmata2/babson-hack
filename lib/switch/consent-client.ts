export type ConsentReceipt = { ok: true; consentToken?: string } | { ok: false; message: string }

/** Ask the server to sign the exact request the household just approved. */
export async function requestConsentToken(body: Record<string, unknown>): Promise<ConsentReceipt> {
  const response = await fetch('/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    consentToken?: string
    message?: string
  } | null
  if (!response.ok || !payload?.ok) {
    return { ok: false, message: payload?.message ?? 'Consent could not be recorded. Nothing was sent.' }
  }
  return { ok: true, consentToken: payload.consentToken }
}
