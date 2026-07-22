import { fileURLToPath } from 'node:url'

import { defineConfig } from 'wxt'

/**
 * Ship only the woff2 KaTeX fonts. Every Chrome at or above our
 * `minimum_chrome_version` supports woff2, so the bundled .woff and .ttf
 * fallbacks are ~800 KB of dead weight. In the final bundle we rewrite the CSS
 * @font-face `src` lists down to their woff2 clause and drop the now-orphaned
 * legacy font assets.
 */
interface BundleAsset {
  type: string
  source?: string | Uint8Array
}

const katexWoff2Only = {
  name: 'katex-woff2-only',
  generateBundle(_options: unknown, bundle: Record<string, BundleAsset>): void {
    const decoder = new TextDecoder()
    for (const [fileName, asset] of Object.entries(bundle)) {
      if (asset.type !== 'asset' || !fileName.endsWith('.css') || asset.source === undefined) {
        continue
      }
      const css = typeof asset.source === 'string' ? asset.source : decoder.decode(asset.source)
      if (!css.includes('KaTeX')) continue
      asset.source = css.replace(/src:[^;{}]+/g, (declaration) => {
        if (!/woff2/i.test(declaration)) return declaration
        const woff2 = declaration
          .slice(4)
          .split(',')
          .map((part) => part.trim())
          .find((part) => /woff2/i.test(part))
        return woff2 ? `src:${woff2}` : declaration
      })
    }
    for (const fileName of Object.keys(bundle)) {
      if (/KaTeX_.*\.(woff|ttf)$/i.test(fileName)) delete bundle[fileName]
    }
  },
}

export default defineConfig({
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [katexWoff2Only],
    build: {
      // Never inline fonts as base64 data URLs: it inflates them ~33% and puts
      // a `;` (data:...;base64) inside @font-face src, defeating the woff2 trim.
      assetsInlineLimit: (filePath: string) =>
        /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined,
    },
  }),
  manifest: {
    name: 'Acopilot4chrome',
    description: 'Ask an OpenAI-compatible endpoint about explicitly captured page text.',
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'sidePanel', 'storage', 'tabs'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Open Acopilot4chrome',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
})
