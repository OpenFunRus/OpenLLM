import net from 'net'

const MAX_RESPONSE_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 20_000

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http/https URLs are supported (got ${parsed.protocol})`)
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isBlockedHost(hostname)) {
    throw new Error(`Blocked host: ${hostname} (private/local addresses are not allowed)`)
  }

  return parsed
}

function isBlockedHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0'
  ) {
    return true
  }

  const ipVersion = net.isIP(hostname)
  if (ipVersion === 4) {
    const [a, b] = hostname.split('.').map(Number)
    if (a === 127 || a === 0 || a === 10) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }

  if (ipVersion === 6) {
    const lower = hostname.toLowerCase()
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true
    }
  }

  return false
}

export async function fetchText(url: URL, init?: RequestInit): Promise<{ text: string; contentType: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenLLM/1.0 (WebFetch)',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        ...(init?.headers ?? {}),
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain'
    if (/^(image|audio|video|application\/octet-stream|application\/pdf)/i.test(contentType)) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > MAX_RESPONSE_BYTES) {
      throw new Error(`Response too large (${buf.length} bytes, max ${MAX_RESPONSE_BYTES})`)
    }

    return { text: buf.toString('utf-8'), contentType }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function htmlToReadableText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  text = text
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|main)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<hr\s*\/?>/gi, '\n---\n')

  text = text.replace(/<[^>]+>/g, '')
  text = decodeHtmlEntities(text)
  text = text.replace(/\r\n/g, '\n').replace(/\t+/g, ' ').replace(/ +/g, ' ')
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')

  return text.trim()
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}

export function truncateText(text: string, maxChars = 12_000): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n… [truncated]`
}
