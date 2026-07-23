import { describe, expect, it } from 'vitest'

import { renderMarkdown } from '../../src/context/markdown'

function renderToElement(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('renderMarkdown newline normalization', () => {
  it('renders line breaks for CRLF/CR and unicode separators', () => {
    const baseline = renderMarkdown('Line1\nLine2')

    const cases: Array<{ label: string; input: string }> = [
      { label: '\\n', input: 'Line1\nLine2' },
      { label: '\\r\\n', input: 'Line1\r\nLine2' },
      { label: '\\r', input: 'Line1\rLine2' },
      { label: 'U+2028', input: `Line1\u2028Line2` },
      { label: 'U+2029', input: `Line1\u2029Line2` },
      { label: 'U+0085', input: `Line1\u0085Line2` },
    ]

    for (const c of cases) {
      const html = renderMarkdown(c.input)
      expect(html, c.label).toBe(baseline)

      const el = renderToElement(html)
      expect(el.querySelector('br'), c.label).not.toBeNull()
    }
  })

  it('preserves blank lines as paragraph breaks', () => {
    const html = renderMarkdown('Line1\n\nLine3')
    const el = renderToElement(html)

    const paragraphs = el.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.item(0)?.textContent).toBe('Line1')
    expect(paragraphs.item(1)?.textContent).toBe('Line3')
  })

  it('preserves paragraph breaks for unicode separators', () => {
    const html = renderMarkdown(`Line1\u2028\u2028Line3`)
    const el = renderToElement(html)

    const paragraphs = el.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.item(0)?.textContent).toBe('Line1')
    expect(paragraphs.item(1)?.textContent).toBe('Line3')
  })
})

describe('renderMarkdown math rendering', () => {
  it('renders escaped display math between regular paragraphs', () => {
    const html = renderMarkdown(`Expand:
\\[
f(b)=\\sum_{i=1}^n (x_i^2-2bx_i+b^2)
=\\sum_{i=1}^n x_i^2-2b\\sum_{i=1}^n x_i+nb^2.
\\]
This is an upward-opening quadratic function.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).not.toContain('\\[')
    expect(el.textContent).toContain('Expand')
    expect(el.textContent).toContain('This is an upward-opening quadratic function')
  })

  it('renders dollar display math without surrounding blank lines', () => {
    const html = renderMarkdown(`Set the derivative to zero:
$$
-2\\sum_{i=1}^n x_i+2nb=0
$$
The optimal solution is the sample mean.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).toContain('Set the derivative to zero')
    expect(el.textContent).toContain('The optimal solution is the sample mean')
  })

  it('renders bare bracket display math when backslashes were stripped', () => {
    const html = renderMarkdown(`Let
[
f(b)=\\sum_{i=1}^n (x_i-b)^2
]
Expand.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).toContain('Let')
    expect(el.textContent).toContain('Expand')
  })

  it('renders dollar display math when content hugs the opening delimiter', () => {
    const html = renderMarkdown(`Sum:
$$\\sum_{i=1}^n x_i
$$
Done.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).toContain('Sum')
    expect(el.textContent).toContain('Done')
  })

  it('renders dollar display math when content hugs the closing delimiter', () => {
    const html = renderMarkdown(`Sum:
$$
\\sum_{i=1}^n x_i$$
Done.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).toContain('Sum')
    expect(el.textContent).toContain('Done')
  })

  it('renders dollar display math placed mid-paragraph after text', () => {
    const html = renderMarkdown(`Look at this: $$
\\sum_{i=1}^n x_i
$$ thanks.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).not.toBeNull()
    expect(el.textContent).not.toContain('$$')
    expect(el.textContent).toContain('Look at this')
    expect(el.textContent).toContain('thanks')
  })

  it('preserves inline `$x$` math without converting it to a block', () => {
    const html = renderMarkdown(`The value $x^2$ is positive.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex')).not.toBeNull()
    expect(el.querySelector('.katex-display')).toBeNull()
    expect(el.textContent).not.toContain('$')
  })

  it('renders command inline math after Chinese punctuation', () => {
    const html =
      renderMarkdown(String.raw`- 满足交换律：$\mathbf{a} \cdot \mathbf{b} = \mathbf{b} \cdot \mathbf{a}$

- 几何意义：$\mathbf{a} \cdot \mathbf{b} = |\mathbf{a}||\mathbf{b}|\cos\theta$`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.textContent).not.toContain('$')
    expect(el.textContent).not.toContain('\\mathbf')
    expect(el.textContent).not.toContain('\\cos')
  })

  it('renders soft-wrapped command inline math after Chinese punctuation', () => {
    const html = renderMarkdown(String.raw`- 满足交换律：$\mathbf{a}
   \cdot \mathbf{b} = \mathbf{b} \cdot \mathbf{a}$

- 几何意义：$\mathbf{a} \cdot \mathbf{b} =
   |\mathbf{a}||\mathbf{b}|\cos\theta$ 这公式不能正常显示`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.textContent).toContain('这公式不能正常显示')
    expect(el.textContent).not.toContain('$')
    expect(el.textContent).not.toContain('\\mathbf')
    expect(el.textContent).not.toContain('\\cos')
  })

  it('preserves $$ literals inside fenced code blocks', () => {
    const html = renderMarkdown(`Example:
\`\`\`
$$
not math
$$
\`\`\`
After.`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-display')).toBeNull()
    expect(el.textContent).toContain('$$')
    expect(el.textContent).toContain('not math')
  })

  it('renders adjacent \\(..\\)\\(..\\) without KaTeX errors', () => {
    const html = renderMarkdown('See \\(\\sum_{i=1}^n x_i\\)\\(\\text{ where } x_i \\geq 0\\) end.')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.textContent).toContain('See')
    expect(el.textContent).toContain('end')
  })

  it('renders \\(..\\) followed immediately by $..$ without errors', () => {
    const html = renderMarkdown('\\(\\sum\\)$\\text{a}$')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('renders $..$ followed immediately by \\(..\\) without errors', () => {
    const html = renderMarkdown('$\\sum$\\(\\text{a}\\)')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('renders \\(..\\) followed immediately by $$..$$ block without errors', () => {
    const html = renderMarkdown('See \\(\\sum\\)$$\nf(x) = x^2\n$$ end')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelector('.katex-display')).not.toBeNull()
  })

  it('leaves currency `$5` text untouched when \\(..\\) is nearby', () => {
    const html = renderMarkdown('See \\(\\sum\\) for $5 cost.')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.textContent).toContain('$5 cost')
  })

  it('renders raw `$x$$y$` adjacency from LLM without KaTeX errors', () => {
    const html = renderMarkdown('$\\sum_{i=1}^n$$\\text{真实值}$')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('renders inline math adjacent to Chinese punctuation', () => {
    const html = renderMarkdown(
      String.raw`范数的意义：它提供了“大小”的统一度量，因此可以定义距离（例如 \(\|x-y\|\)）、衡量误差、做正则化（如深度学习里的 \(L_2\) 权重衰减、\(L_1\) 稀疏正则）等。`,
    )
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(3)
    expect(el.textContent).toContain('权重衰减')
    expect(el.textContent).not.toContain('$')
    expect(el.textContent).not.toContain('\\|')
  })

  it('renders simple dollar math before Chinese punctuation', () => {
    const html = renderMarkdown(String.raw`比如某层的权重 W 和偏置 $b$；`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(1)
    expect(el.textContent).not.toContain('$')
  })

  it('repairs a missing closing delimiter before Chinese prose', () => {
    const html = renderMarkdown(String.raw`如深度学习里的 $L_2 权重衰减、$L_1$ 稀疏正则`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.textContent).toContain('权重衰减')
    expect(el.textContent).toContain('稀疏正则')
    expect(el.textContent).not.toContain('$')
  })

  it('renders a fragmented sum expression with text content as one formula', () => {
    const html = renderMarkdown('\\sum $\\text{真实值}-\\text{预测值}$^2')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(1)
    expect(el.textContent).not.toContain('\\sum')
  })

  it('renders full math lines with inline dollar fragments from LLM output', () => {
    const html = renderMarkdown(
      '\\sum_{i=1}^n (x_i-b)^2 = \\sum_{i=1}^n $x_i-\\bar x$^2 + n$b-\\bar x$^2',
    )
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(1)
    expect(el.textContent).not.toContain('\\sum')
    expect(el.textContent).not.toContain('$')
  })

  it('renders distribution lines with stuck inline dollar fragments', () => {
    const html = renderMarkdown('x_1,\\dots,x_n \\overset{iid}{\\sim} N$b,\\sigma^2$')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).toHaveLength(1)
    expect(el.textContent).not.toContain('\\overset')
    expect(el.textContent).not.toContain('$')
  })

  it('renders broken math fragments in a Chinese paragraph context', () => {
    const html = renderMarkdown(String.raw`还可以写成一个很漂亮的形式：
\sum_{i=1}^n (x_i-b)^2 = \sum_{i=1}^n $x_i-\bar x$^2 + n$b-\bar x$^2
后面第二项总是 ≥ 0，所以当且仅当 $b=\bar x$ 时取到最小值。
它和正态分布的关系在于：如果假设数据
x_1,\dots,x_n \overset{iid}{\sim} N$b,\sigma^2$
其中方差 $\sigma^2$ 已知或未知都没关系。`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.textContent).not.toContain('\\sum_{i=1}^n $')
    expect(el.textContent).not.toContain('N$b')
  })

  it('keeps prose outside a same-line broken math fragment', () => {
    const html = renderMarkdown(
      String.raw`\sum_{i=1}^n (x_i-b)^2 = \sum_{i=1}^n $x_i-\bar x$^2 + n$b-\bar x$^2 这公式是什么意思`,
    )
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelector('.katex')).not.toBeNull()
    expect(el.textContent).toContain('这公式是什么意思')
    expect(el.textContent).not.toContain('n$b')
  })

  it('renders broken math when surrounded by Chinese prefix AND suffix on the same line', () => {
    const html = renderMarkdown(
      String.raw`像：\sum_{i=1}^n (x_i-b)^2 = \sum_{i=1}^n $x_i-\bar x$^2 + n$\bar x-b$^2 这种仍然无法正常显示`,
    )
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelector('.katex')).not.toBeNull()
    expect(el.textContent).toContain('像')
    expect(el.textContent).toContain('这种仍然无法正常显示')
    expect(el.textContent).not.toContain('\\sum')
    expect(el.textContent).not.toContain('n$')
  })

  it('renders standalone `letter$math$^suffix` fragment without a leading LaTeX command', () => {
    const html = renderMarkdown(String.raw`n$b-\bar x$^2`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelector('.katex')).not.toBeNull()
    expect(el.textContent).not.toContain('$')
    expect(el.textContent).not.toContain('\\bar')
  })

  it('does not break parens-with-LaTeX-command inside a display math block', () => {
    const html = renderMarkdown(String.raw`prelude

\[
\sum_{i=1}^n (x_i-b)^2
=
\sum_{i=1}^n (x_i-\bar x)^2
+
n(\bar x-b)^2
\]

epilogue`)
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.querySelectorAll('.katex')).not.toHaveLength(0)
    expect(el.textContent).not.toContain('$')
    expect(el.textContent).not.toContain('\\sum')
  })

  it('keeps `$5 and $$f(x)$$` untouched (currency, not adjacent inline math)', () => {
    const html = renderMarkdown('cost $5 and $$f(x)$$ end')
    const el = renderToElement(html)

    expect(el.querySelector('.katex-error')).toBeNull()
    expect(el.textContent).toContain('$5')
  })
})

describe('renderMarkdown safety and screenshot regressions', () => {
  it('normalizes double-escaped commands and a glued square-root argument', () => {
    const input = String.raw`点积注意力：$q\\cdot k$，缩放点积：$q^T / \\sqrtd$`
    const el = renderToElement(renderMarkdown(input))

    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.textContent).toContain('⋅')
    expect(el.textContent).not.toContain('cdot')
    expect(el.textContent).not.toContain('sqrtd')
  })

  it('repairs the single-escaped form shown in the chat screenshot', () => {
    const input = String.raw`点积注意力：$q\cdot k$，缩放点积：$q^T / \sqrtd$`
    const el = renderToElement(renderMarkdown(input))

    expect(el.querySelectorAll('.katex')).toHaveLength(2)
    expect(el.querySelectorAll('.katex-error')).toHaveLength(0)
    expect(el.textContent).not.toContain('sqrtd')
  })

  it('preserves math-like delimiters inside inline and fenced code', () => {
    const html = renderMarkdown('`\\(inline\\)`\n\n```tex\n\\[\nx + y\n\\]\n```')

    expect(html).toContain('\\(inline\\)')
    expect(html).toContain('\\[')
    expect(html).not.toContain('katex')
  })

  it('keeps code blocks copyable and raw HTML inert', () => {
    const input = '```js\nconst a = 1\n```\n\n<img src=x onerror=alert(1)>'
    const html = renderMarkdown(input)

    expect(html).toContain('copy-code')
    expect(html).toContain('aria-label="Copy code"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('>Copy code</button>')
    expect(html).not.toContain('<img src=x')
  })

  it('opens safe links in a new tab and rejects dangerous schemes', () => {
    const safe = renderMarkdown('[site](https://example.com)')
    expect(safe).toContain('target="_blank"')
    expect(safe).toContain('rel="noopener noreferrer"')

    const dangerous = renderMarkdown('[x](javascript:alert(1))')
    expect(dangerous).not.toContain('href="javascript:')
  })
})
