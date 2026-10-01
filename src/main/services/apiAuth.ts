export type ApiAuthType = 'none' | 'auto' | 'bearer' | 'raw' | 'x-api-key'

/** Убирает лишние пробелы и префикс Bearer, если пользователь вставил его сам. */
export function normalizeApiToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, '')
}

/** Ключи OpenAI/DeepSeek и т.п. — с Bearer. Короткие/произвольные — как есть. */
export function resolveAuthType(token: string, authType: ApiAuthType = 'auto'): ApiAuthType {
  if (authType !== 'auto') return authType
  const t = normalizeApiToken(token)
  if (/^(sk|gsk|pk)-/i.test(t)) return 'bearer'
  return 'raw'
}

export function buildAuthHeaders(token: string, authType: ApiAuthType = 'auto'): Record<string, string> {
  if (authType === 'none') return {}

  const normalized = normalizeApiToken(token)
  if (!normalized) return {}

  switch (resolveAuthType(normalized, authType)) {
    case 'bearer':
      return { Authorization: `Bearer ${normalized}` }
    case 'raw':
      return { Authorization: normalized }
    case 'x-api-key':
      return { 'x-api-key': normalized }
    default:
      return { Authorization: normalized }
  }
}
