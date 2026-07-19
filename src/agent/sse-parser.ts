export interface ServerSentEvent {
  data: string
  event?: string
  id?: string
}

export class SseParser {
  private buffer = ''
  private dataLines: string[] = []
  private eventType: string | undefined
  private lastEventId: string | undefined

  feed(chunk: string): ServerSentEvent[] {
    this.buffer += chunk
    return this.drain(false)
  }

  end(): ServerSentEvent[] {
    return this.drain(true)
  }

  private drain(final: boolean): ServerSentEvent[] {
    const events: ServerSentEvent[] = []

    while (true) {
      const lineBreak = findLineBreak(this.buffer, final)
      if (!lineBreak) {
        break
      }

      const line = this.buffer.slice(0, lineBreak.index)
      this.buffer = this.buffer.slice(lineBreak.index + lineBreak.length)
      this.processLine(line, events)
    }

    if (final) {
      if (this.buffer.length > 0) {
        this.processLine(this.buffer, events)
        this.buffer = ''
      }
      this.dispatch(events)
    }

    return events
  }

  private processLine(line: string, events: ServerSentEvent[]): void {
    if (line.length === 0) {
      this.dispatch(events)
      return
    }

    if (line.startsWith(':')) {
      return
    }

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    switch (field) {
      case 'data':
        this.dataLines.push(value)
        break
      case 'event':
        this.eventType = value
        break
      case 'id':
        if (!value.includes('\u0000')) {
          this.lastEventId = value
        }
        break
      default:
        break
    }
  }

  private dispatch(events: ServerSentEvent[]): void {
    if (this.dataLines.length === 0) {
      this.eventType = undefined
      return
    }

    const event: ServerSentEvent = { data: this.dataLines.join('\n') }
    if (this.eventType) {
      event.event = this.eventType
    }
    if (this.lastEventId !== undefined) {
      event.id = this.lastEventId
    }
    events.push(event)
    this.dataLines = []
    this.eventType = undefined
  }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
        yield event
      }
    }

    const tail = decoder.decode()
    for (const event of parser.feed(tail)) {
      yield event
    }
    for (const event of parser.end()) {
      yield event
    }
  } finally {
    reader.releaseLock()
  }
}

function findLineBreak(
  input: string,
  final: boolean,
): { index: number; length: number } | undefined {
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '\n') {
      return { index, length: 1 }
    }
    if (character === '\r') {
      if (index + 1 >= input.length && !final) {
        return undefined
      }
      return { index, length: input[index + 1] === '\n' ? 2 : 1 }
    }
  }

  return undefined
}
