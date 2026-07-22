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

/** Render assistant Markdown (with LaTeX math) to sanitized HTML. */
export function renderMarkdown(content: string): string {
  return markdown.render(content)
}
