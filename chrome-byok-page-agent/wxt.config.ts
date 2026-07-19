import { fileURLToPath } from 'node:url'

import { defineConfig } from 'wxt'

export default defineConfig({
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Acopilot4chrome',
    description: 'Ask an OpenAI-compatible endpoint about explicitly captured page text.',
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'sidePanel', 'storage'],
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
