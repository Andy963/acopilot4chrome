const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  'http:': '80',
  'https:': '443',
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeContextUrl(input: string): string {
  const value = input.trim()

  try {
    const url = new URL(value)
    url.hash = ''

    if (DEFAULT_PORTS[url.protocol] === url.port) {
      url.port = ''
    }

    return url.href
  } catch {
    return value
  }
}
