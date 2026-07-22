import markdownItKatexDefault from '@vscode/markdown-it-katex'
import MarkdownIt from 'markdown-it'
import * as markdownItKatexNamespace from '@vscode/markdown-it-katex'

type MarkdownItPlugin = (md: MarkdownIt, options?: unknown) => void

/**
 * `@vscode/markdown-it-katex` is a CommonJS module (`exports.default = fn`).
 * Depending on the bundler's interop, the imported value can be the function,
 * `{ default: fn }`, or a namespace object — and calling `md.use()` on a
 * non-function throws "x.apply is not a function", which previously blanked the
 * whole message list. Resolve to the actual callable regardless of interop, or
 * null so the caller can skip math and still render plain Markdown.
 */
function resolveKatexPlugin(): MarkdownItPlugin | null {
  for (const candidate of [markdownItKatexDefault, markdownItKatexNamespace]) {
    let value: unknown = candidate
    for (
      let depth = 0;
      depth < 5 && value && typeof value === 'object' && 'default' in value;
      depth++
    ) {
      value = (value as { default: unknown }).default
    }
    if (typeof value === 'function') return value as MarkdownItPlugin
  }
  return null
}

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
})

// Math rendering is optional: if the KaTeX plugin can't be resolved, keep
// rendering plain Markdown rather than throwing and blanking the chat.
const katexPlugin = resolveKatexPlugin()
if (katexPlugin) markdown.use(katexPlugin, { throwOnError: false })

markdown.validateLink = (url) => /^(https?:|mailto:)/i.test(url)
markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  const token = tokens[index]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return renderer.renderToken(tokens, index, options)
}

const renderFence = markdown.renderer.rules.fence?.bind(markdown.renderer.rules)
markdown.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
  const code = renderFence
    ? renderFence(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)
  return `<div class="code-block"><button class="copy-code" type="button">Copy code</button>${code}</div>`
}

function normalizeMathDelimiters(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029\u0085]/g, '\n')
  if (
    !/\\(?:\(|\[)/.test(normalized) &&
    !/\$\$[\s\S]*\n[\s\S]*\$\$/.test(normalized) &&
    !/\\\\[A-Za-z]/.test(normalized)
  ) {
    return normalized
  }

  const protectedCode: string[] = []
  const stashCode = (match: string): string => {
    const index = protectedCode.push(match) - 1
    return `\uE000ACOPILOT_CODE_${index}\uE001`
  }

  let working = normalized.replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1/g, stashCode)
  working = working.replace(/(`+)[^`\n]*?\1/g, stashCode)
  working = working.replace(
    /\\\[([\s\S]+?)\\\]/g,
    (_match, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`,
  )
  working = working.replace(
    /\\\(([\s\S]+?)\\\)/g,
    (match, formula: string, offset: number, source: string) => {
      const nextOffset = offset + match.length
      const leadingSpace = source[offset - 1] === '$' ? ' ' : ''
      const trailingSpace =
        source[nextOffset] === '$' || source.slice(nextOffset, nextOffset + 2) === '\\(' ? ' ' : ''
      return `${leadingSpace}$${formula}$${trailingSpace}`
    },
  )
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula: string) =>
    formula.includes('\n') ? `\n\n$$\n${formula.trim()}\n$$\n\n` : match,
  )
  working = working.replace(
    /(\${1,2})([\s\S]*?)\1/g,
    (match, delimiter: string, formula: string) => {
      const normalizedFormula = formula.replace(/\\\\(?=[A-Za-z])/g, '\\')
      return `${delimiter}${normalizedFormula}${delimiter}`
    },
  )

  return working.replace(/\uE000ACOPILOT_CODE_(\d+)\uE001/g, (_match, index: string) => {
    return protectedCode[Number(index)] ?? ''
  })
}

/** Render assistant Markdown (with LaTeX math) to sanitized HTML. */
export function renderMarkdown(content: string): string {
  return markdown.render(normalizeMathDelimiters(content))
}
