import { defineConfig } from 'wxt'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { PRODUCT_NAME } from './shared/product'
import { ORT_WEBGPU_RUNTIME_FILES } from './shared/ort-runtime'

function copyOrtRuntime(): void {
  const require = createRequire(import.meta.url)
  const ortEntry = require.resolve('onnxruntime-web')
  const ortDist = resolve(dirname(ortEntry))
  const destDir = resolve('public/ort')
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })

  for (const f of ORT_WEBGPU_RUNTIME_FILES) {
    cpSync(resolve(ortDist, f), resolve(destDir, f), { force: true })
  }
}

copyOrtRuntime()

export default defineConfig({
  srcDir: '.',
  vite: () => ({
    build: {
      // The tokenizer and WebGPU session bootstrap intentionally share one
      // offscreen entry chunk. Keep the ceiling tight so unexpected growth
      // still warns while the audited ~651 kB runtime and migration port do not.
      chunkSizeWarningLimit: 655,
    },
  }),
  manifest: {
    name: PRODUCT_NAME,
    description: 'Local AI-text detector — right-click selected text.',
    action: {
      default_title: `${PRODUCT_NAME} — click to open options`,
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
