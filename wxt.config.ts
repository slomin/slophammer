import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Slop Hammer',
    description: 'Local AI-text detector — right-click selected text.',
    permissions: [
      'contextMenus',
      'activeTab',
      'scripting',
      'offscreen',
      'storage',
      'unlimitedStorage',
    ],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
})
