import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Slop Hammer',
    description: 'Scores text for AI-slop likelihood.',
    permissions: ['storage'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
})
