import { describe, expect, it } from 'vitest'

import { parseSseStream, SseParser } from '../../src/agent/sse-parser'

describe('SseParser', () => {
  it('parses multiple events from one chunk and ignores unknown fields', () => {
    const parser = new SseParser()
    const events = parser.feed(
      'retry: 1000\ndata: {"one":1}\n\nevent: message\nid: 2\ndata: {"two":2}\n\n',
    )

    expect(events).toEqual([
      { data: '{"one":1}' },
      { data: '{"two":2}', event: 'message', id: '2' },
    ])
  })

  it('parses an event split across arbitrary CRLF chunk boundaries', () => {
    const parser = new SseParser()

    expect(parser.feed('data: {"choices":')).toEqual([])
    expect(parser.feed('[]}\r')).toEqual([])
    expect(parser.feed('\n\r\n')).toEqual([{ data: '{"choices":[]}' }])
  })

  it('flushes a final event without a trailing blank line', () => {
    const parser = new SseParser()
    parser.feed('data: [DONE]')
    expect(parser.end()).toEqual([{ data: '[DONE]' }])
  })
})

describe('parseSseStream', () => {
  it('preserves multi-byte text split across byte chunks', async () => {
    const encoded = new TextEncoder().encode('data: {"text":"café"}\n\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, encoded.length - 2))
        controller.enqueue(encoded.slice(encoded.length - 2))
        controller.close()
      },
    })

    const events = []
    for await (const event of parseSseStream(stream)) {
      events.push(event)
    }

    expect(events).toEqual([{ data: '{"text":"café"}' }])
  })
})
