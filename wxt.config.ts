import { defineConfig } from 'wxt'
import { cpSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

function copyOrtRuntime(): void {
  const require = createRequire(import.meta.url)
  const ortEntry = require.resolve('onnxruntime-web')
  const ortDist = resolve(dirname(ortEntry))
  const destDir = resolve('public/ort')
  mkdirSync(destDir, { recursive: true })

  // WebGPU runtime needs the jsep pair; asyncify is the CPU WASM fallback.
  const files = [
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm',
  ]
  for (const f of files) {
    cpSync(resolve(ortDist, f), resolve(destDir, f), { force: true })
  }
}

copyOrtRuntime()

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Slop Hammer',
    description: 'Local AI-text detector — right-click selected text.',
    action: {
      default_title: 'Slop Hammer — click to open options',
    },
    permissions: [
      'contextMenus',
      'activeTab',
      'offscreen',
      'scripting',
      'storage',
      'unlimitedStorage',
    ],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    web_accessible_resources: [
      {
        resources: ['ort/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
})
