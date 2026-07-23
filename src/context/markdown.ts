import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import katex from 'katex'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const escapeHtmlMinimal = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const highlightCode = (code: string, lang?: string): string => {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang }).value
    } catch {
      // fallback below
    }
  }
  try {
    return hljs.highlightAuto(code).value
  } catch {
    return ''
  }
}

const COPY_BUTTON_HTML =
  '<button class="copy-code" aria-label="Copy code"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="10" height="10" rx="1.5"/><path d="M15 9V6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15H9"/></svg></button>'

const renderCodeBlock = (
  codeForHighlight: string,
  codeForEscape: string,
  lang?: string,
): string => {
  const highlighted = highlightCode(codeForHighlight, lang) || escapeHtmlMinimal(codeForEscape)
  const langClass = lang ? ` language-${lang}` : ''
  return `<pre class="hljs${langClass}">${COPY_BUTTON_HTML}<code class="hljs${langClass}">${highlighted}</code></pre>`
}

marked.setOptions({
  breaks: true,
  gfm: true,
})

marked.use({
  renderer: {
    code({ text, lang }) {
      return renderCodeBlock(text.trim(), text, lang)
    },
  },
})

marked.use(
  markedKatex({
    throwOnError: false,
    output: 'html',
  }),
)

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const SANITIZE_CONFIG = {
  ADD_TAGS: [
    'button',
    'svg',
    'path',
    'rect',
    'br',
    'math',
    'semantics',
    'mrow',
    'mi',
    'mn',
    'mo',
    'ms',
    'mtext',
    'msup',
    'msub',
    'msubsup',
    'mfrac',
    'msqrt',
    'mroot',
    'mover',
    'munder',
    'munderover',
    'mtable',
    'mtr',
    'mtd',
    'mspace',
    'mphantom',
    'mstyle',
    'menclose',
    'annotation',
  ],
  ADD_ATTR: [
    'aria-label',
    'aria-hidden',
    'role',
    'xmlns',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'x',
    'y',
    'width',
    'height',
    'rx',
    'ry',
    'd',
    'class',
    'style',
    'data-url',
    'mathvariant',
    'displaystyle',
    'scriptlevel',
    'encoding',
  ],
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

function normalizeMarkdownNewlines(content: string): string {
  return content.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029\u0085]/g, '\n')
}

function asDisplayMathBlock(content: string): string {
  return `\n\n$$\n${content.trim()}\n$$\n\n`
}

function stripTextCommands(content: string): string {
  return content.replace(/\\text\{[^}\n]*\}/g, '')
}

const CJK_TEXT = /[\u3000-\u9fff\uff00-\uffef]/
const KATEX_STANDARD_CLOSING_BOUNDARY = /[\s?!.,:？！。，：]/
const SIMPLE_INLINE_MATH_TOKEN = String.raw`[A-Za-z][A-Za-z0-9]*(?:[_^](?:[A-Za-z0-9]+|\{[^}\n]+\}))*`

function splitProseAndMath(line: string): { leading: string; math: string; trailing: string } {
  let braceDepth = 0
  let mathStart = -1
  let mathEnd = -1

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '{') {
      if (mathStart === -1) mathStart = index
      braceDepth += 1
      continue
    }
    if (character === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }
    if (braceDepth !== 0 || character === undefined) continue
    if (CJK_TEXT.test(character)) {
      if (mathStart !== -1) {
        mathEnd = index
        break
      }
      continue
    }
    if (mathStart === -1 && !/\s/.test(character)) mathStart = index
  }

  if (mathStart === -1) return { leading: line, math: '', trailing: '' }
  if (mathEnd === -1) mathEnd = line.length

  return {
    leading: line.slice(0, mathStart),
    math: line.slice(mathStart, mathEnd).trimEnd(),
    trailing: line.slice(mathEnd),
  }
}

function looksAllMathLine(content: string): boolean {
  if (CJK_TEXT.test(stripTextCommands(content))) return false

  const stripped = stripTextCommands(content)
    .replace(/\\[A-Za-z]+\{[^}\n]*\}/g, '')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/\$[^$\n]+\$/g, '')
    .replace(/[_^]\{[^}\n]*\}/g, '')
    .replace(/[_^]\w/g, '')
    .replace(/\{[^}\n]*\}/g, '')
    .replace(/[\d+\-*/=(){}.,\s]/g, ' ')
  return !/[A-Za-z]{2,}/.test(stripped)
}

function normalizeRawLatexLine(line: string): string {
  if (/\\[()[\]]/.test(line) || !/\$[^$\n]+\$/.test(line)) return line

  const { leading, math, trailing } = splitProseAndMath(line)
  if (!math) return line

  const outsideDollar = math.replace(/\$[^$\n]+\$/g, '')
  const hasExternalCommand = /\\[A-Za-z]+/.test(outsideDollar)
  const hasBrokenSuffix = /\$[^$\n]+?\$[_^](?:\w|\{[^}\n]*\})/.test(math)
  if ((!hasExternalCommand && !hasBrokenSuffix) || !looksAllMathLine(math)) return line

  const stripped = math.replace(/\$([^$\n]+)\$/g, '($1)')
  const normalizedLeading = leading.trimEnd()
  const normalizedTrailing = trailing.trimStart()
  const leadingSeparator = normalizedLeading ? ' ' : ''
  const trailingSeparator = normalizedTrailing ? ' ' : ''
  return `${normalizedLeading}${leadingSeparator}$${stripped}$${trailingSeparator}${normalizedTrailing}`
}

function isInsideDollarMath(content: string, offset: number): boolean {
  let inBlock = false
  let inlineParity = 0
  let index = 0

  while (index < offset) {
    const character = content[index]
    const previous = index > 0 ? content[index - 1] : ''
    if (character === '$' && previous !== '\\') {
      if (content[index + 1] === '$') {
        inBlock = !inBlock
        index += 2
        continue
      }
      if (!inBlock) inlineParity ^= 1
    }
    index += 1
  }

  return inBlock || inlineParity === 1
}

function isEscapedCharacter(content: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function looksLikelyInlineMath(content: string): boolean {
  const stripped = stripTextCommands(content).trim()
  if (!stripped || CJK_TEXT.test(stripped)) return false
  if (/\\[^\s]/.test(stripped)) return true
  if (/[_^{}=+\-*/<>|]/.test(stripped)) return true
  if (/^[A-Za-z]$/.test(stripped)) return true
  return new RegExp(`^${SIMPLE_INLINE_MATH_TOKEN}$`).test(stripped)
}

function needsInlineMathLeadingSpace(character: string | undefined): boolean {
  return character !== undefined && !/\s/.test(character)
}

function needsInlineMathTrailingSpace(character: string | undefined): boolean {
  return character !== undefined && !KATEX_STANDARD_CLOSING_BOUNDARY.test(character)
}

function repairInterruptedSimpleInlineMath(content: string): string {
  const interruptedSimpleMath = new RegExp(
    `(^|[^\\\\])\\$(${SIMPLE_INLINE_MATH_TOKEN})([ \\t]+)([^$\\n]*?)(?=\\$[A-Za-z\\\\])`,
    'g',
  )

  return content.replace(
    interruptedSimpleMath,
    (match, prefix: string, token: string, whitespace: string, prose: string) => {
      if (!CJK_TEXT.test(prose) || !looksLikelyInlineMath(token)) return match
      return `${prefix}$${token}$${whitespace}${prose}`
    },
  )
}

function normalizeInlineDollarMathBoundaries(content: string): string {
  let result = ''
  let last = 0
  let index = 0

  while (index < content.length) {
    if (content[index] !== '$' || isEscapedCharacter(content, index)) {
      index += 1
      continue
    }

    if (content[index + 1] === '$') {
      const blockEnd = content.indexOf('$$', index + 2)
      index = blockEnd === -1 ? index + 2 : blockEnd + 2
      continue
    }

    let end = -1
    for (let cursor = index + 1; cursor < content.length; cursor += 1) {
      if (content[cursor] !== '$' || isEscapedCharacter(content, cursor)) continue
      if (content[cursor + 1] === '$') {
        cursor += 1
        continue
      }
      end = cursor
      break
    }
    if (end === -1) break

    const formula = content.slice(index + 1, end)
    if (!looksLikelyInlineMath(formula)) {
      index += 1
      continue
    }

    const previous = index > 0 ? content[index - 1] : undefined
    const next = end + 1 < content.length ? content[end + 1] : undefined
    result += content.slice(last, index)
    if (needsInlineMathLeadingSpace(previous)) result += ' '
    result += `$${formula}$`
    if (needsInlineMathTrailingSpace(next)) result += ' '
    last = end + 1
    index = end + 1
  }

  return result + content.slice(last)
}

function normalizeCommandInlineDollarMath(content: string): string {
  let result = ''
  let last = 0
  let index = 0

  while (index < content.length) {
    if (content[index] !== '$' || isEscapedCharacter(content, index)) {
      index += 1
      continue
    }

    if (content[index + 1] === '$') {
      let blockEnd = -1
      for (let cursor = index + 2; cursor < content.length - 1; cursor += 1) {
        if (
          content[cursor] === '$' &&
          content[cursor + 1] === '$' &&
          !isEscapedCharacter(content, cursor)
        ) {
          blockEnd = cursor
          break
        }
      }
      if (blockEnd === -1) break
      index = blockEnd + 2
      continue
    }

    let end = -1
    for (let cursor = index + 1; cursor < content.length; cursor += 1) {
      if (content[cursor] === '$' && !isEscapedCharacter(content, cursor)) {
        end = cursor
        break
      }
    }
    if (end === -1) break

    const formula = content.slice(index + 1, end)
    if (/\\[A-Za-z]+/.test(formula) && formula.trim()) {
      const previous = index > 0 ? content[index - 1] : ''
      const next = end + 1 < content.length ? content[end + 1] : ''
      const leading = previous && !/\s/.test(previous) && previous !== '$' ? ' ' : ''
      const trailing = next && !/[\s?!.,:？！。，：]/.test(next) && next !== '$' ? ' ' : ''
      const normalizedFormula = formula.replace(/[ \t]*\n[ \t]*/g, ' ').trim()
      result += `${content.slice(last, index)}${leading}$${normalizedFormula}$${trailing}`
      last = end + 1
    }
    index = end + 1
  }

  return result + content.slice(last)
}

function normalizeFormulaSyntax(formula: string): string {
  return formula.replace(/\\\\(?=[A-Za-z])/g, '\\').replace(/\\sqrt([A-Za-z0-9])/g, '\\sqrt{$1}')
}

function normalizeMathDelimiters(content: string): string {
  if (!content) return content

  const hasEscapedDelimiters = /\\(?:\(|\[)/.test(content)
  const hasDisplayMath = /\$\$[\s\S]*?\n[\s\S]*?\$\$/.test(content)
  const hasBareBlock = /(^|\n)[ \t]*\[[ \t]*\n[\s\S]*?\n[ \t]*\][ \t]*(\n|$)/.test(content)
  const hasBareInline = /\([^()\n]*\\[A-Za-z]+[^()\n]*\)/.test(content)
  const hasInlineAdjacency = /\$[^$\n]+?\$\$[^$\n]+?\$/.test(content)
  const hasBrokenSuffix = /\$[^$\n]+?\$[_^](?:\w|\{[^}\n]*\})/.test(content)
  const hasRawLatexLineWithDollarFragment = /^[^\n]*\\[A-Za-z]+[^\n]*\$[^$\n]+\$[^\n]*$/m.test(
    content,
  )
  const hasCommandInlineDollar = /(?:^|[^$])\$[^$]*\\[A-Za-z]+[^$]*\$(?!\$)/.test(content)
  const hasInlineDollarMath = /(?:^|[^\\$])\$[^$\n]+?\$(?!\$)/.test(content)
  const hasLetterStuckDollar = /[A-Za-z0-9}]\$[^\s$]|[^\s$]\$[A-Za-z0-9{]/.test(content)
  const hasEscapedCommand = /\\\\[A-Za-z]/.test(content)
  if (
    !hasEscapedDelimiters &&
    !hasDisplayMath &&
    !hasBareBlock &&
    !hasBareInline &&
    !hasInlineAdjacency &&
    !hasBrokenSuffix &&
    !hasRawLatexLineWithDollarFragment &&
    !hasCommandInlineDollar &&
    !hasInlineDollarMath &&
    !hasLetterStuckDollar &&
    !hasEscapedCommand
  ) {
    return content
  }

  const protectedCode: string[] = []
  const stashCode = (match: string): string => {
    const index = protectedCode.push(match) - 1
    return `\uE000ACOPILOT_CODE_${index}\uE001`
  }

  let working = content.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1/g, stashCode)
  working = working.replace(/(`+)[^`\n]*?\1/g, stashCode)
  working = working.replace(/^[^\n]+$/gm, normalizeRawLatexLine)

  working = working.replace(/\\\[([\s\S]+?)\\\]/g, (_match, formula: string) =>
    asDisplayMathBlock(formula),
  )
  working = working.replace(
    /\\\(([\s\S]+?)\\\)/g,
    (match, formula: string, offset: number, source: string) => {
      const previous = source[offset - 1]
      const nextOffset = offset + match.length
      const next = source[nextOffset]
      const leading = previous === '$' ? ' ' : ''
      const trailing = next === '$' || source.slice(nextOffset, nextOffset + 2) === '\\(' ? ' ' : ''
      return `${leading}$${formula}$${trailing}`
    },
  )
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula: string) =>
    formula.includes('\n') ? asDisplayMathBlock(formula) : match,
  )
  working = normalizeCommandInlineDollarMath(working)
  working = working.replace(
    /\$([^$\n]+?)\$(?=\$([^$\n]+?)\$)/g,
    (match, firstFormula: string, secondFormula: string) => {
      const looksLikeMath = (formula: string): boolean => /\\[A-Za-z]+|[\^_{}]/.test(formula)
      return looksLikeMath(firstFormula) && looksLikeMath(secondFormula)
        ? `$${firstFormula}$ `
        : match
    },
  )
  working = working.replace(
    /(\\[A-Za-z]+(?:[_^](?:\w|\{[^}\n]*\}))?)(\s+)\$([^$\n]+?)\$(\s*)([_^])(\w|\{[^}\n]*\})/g,
    (
      _match,
      command: string,
      _leadingWhitespace: string,
      formula: string,
      _trailingWhitespace: string,
      operator: string,
      suffix: string,
    ) => `$${command} (${formula})${operator}${suffix}$`,
  )
  working = working.replace(/^[^\n]+$/gm, normalizeRawLatexLine)
  working = working.replace(
    /(^|\n)[ \t]*\[[ \t]*\n([\s\S]+?)\n[ \t]*\][ \t]*(?=\n|$)/g,
    (match, prefix: string, formula: string) => {
      if (!/\\[A-Za-z]+|[=+\-*/^_]/.test(formula)) return match
      return `${prefix}${asDisplayMathBlock(formula)}`
    },
  )
  working = working.replace(
    /\(([^()\n]*\\[A-Za-z]+[^()\n]*)\)/g,
    (match: string, formula: string, offset: number, source: string) =>
      isInsideDollarMath(source, offset) ? match : `$${formula.trim()}$`,
  )
  working = repairInterruptedSimpleInlineMath(working)
  working = normalizeInlineDollarMathBoundaries(working)
  working = working.replace(
    /(\${1,2})([\s\S]*?)\1/g,
    (_match, delimiter: string, formula: string) =>
      `${delimiter}${normalizeFormulaSyntax(formula)}${delimiter}`,
  )

  return working.replace(/\uE000ACOPILOT_CODE_(\d+)\uE001/g, (_match, index: string) => {
    return protectedCode[Number(index)] ?? ''
  })
}

function renderNormalizedMath(source: string): string | null {
  const normalized = normalizeMathDelimiters(source).trim()
  const displayMatch = normalized.match(/^\$\$([\s\S]+)\$\$$/)
  const displayFormula = displayMatch?.[1]
  if (displayFormula !== undefined) {
    return katex.renderToString(displayFormula.trim(), {
      throwOnError: false,
      output: 'html',
      displayMode: true,
    })
  }

  const inlineMatch = normalized.match(/^\$([\s\S]+)\$$/)
  const inlineFormula = inlineMatch?.[1]
  if (inlineFormula !== undefined) {
    return katex.renderToString(inlineFormula.trim(), {
      throwOnError: false,
      output: 'html',
      displayMode: false,
    })
  }

  if (/\\[A-Za-z]+|[_^{}=+\-*/<>|]/.test(normalized)) {
    return katex.renderToString(normalizeFormulaSyntax(normalized), {
      throwOnError: false,
      output: 'html',
      displayMode: false,
    })
  }

  return null
}

function repairKatexErrors(html: string): string {
  if (!html.includes('katex-error') || typeof document === 'undefined') return html

  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('.katex-error').forEach((node) => {
    const repaired = renderNormalizedMath(node.textContent || '')
    if (!repaired || repaired.includes('katex-error')) return

    const wrapper = document.createElement('span')
    wrapper.innerHTML = repaired
    node.replaceWith(...Array.from(wrapper.childNodes))
  })

  return template.innerHTML
}

/** Render assistant Markdown with normalized LaTeX and inert raw HTML. */
export function renderMarkdown(content: string): string {
  if (!content) return ''
  const normalized = normalizeMathDelimiters(normalizeMarkdownNewlines(content))
  const html = marked.parse(normalized) as string
  return sanitizeHtml(repairKatexErrors(html))
}
