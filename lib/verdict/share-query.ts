const SHAREABLE = new Set([
  'fuel', 'units', 'price', 'town', 'tier', 'year', 'inc', 'yb', 'sqft', 'src', 'bu', 'm', 'mc', 'ut', 'er', 'li', 'wz', 'sz', 'ic', 'demo',
])

export function shareableQuery(query: string): URLSearchParams {
  const out = new URLSearchParams()
  for (const [key, value] of new URLSearchParams(query)) if (SHAREABLE.has(key)) out.append(key, value)
  return out
}

export function verdictPath(query: string): string {
  return `/verdict?${shareableQuery(query).toString()}`
}
