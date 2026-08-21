import { defineConfig } from 'wxt'
import { defaultClientConditions } from 'vite'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { PRODUCT_NAME } from './shared/product'
import { ORT_RUNTIME_FILES } from './shared/ort-runtime'

function copyOrtRuntime(): void {
  const require = createRequire(import.meta.url)
  const ortEntry = require.resolve('onnxruntime-web')
  const ortDist = resolve(dirname(ortEntry))
  const destDir = resolve('public/ort')
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })

  for (const f of ORT_RUNTIME_FILES) {
    cpSync(resolve(ortDist, f), resolve(destDir, f), { force: true })
  }
}

copyOrtRuntime()

export default defineConfig({
  srcDir: '.',
  vite: () => ({
    resolve: {
      // Selects ONNX Runtime's extern-wasm entry over its bundled one. The
      // bundled entry inlines the emscripten factory, which carries
      // `new URL('…asyncify.wasm', import.meta.url)` — enough for Vite to emit
      // its own 27 MB copy of a binary we already ship at `ort/` and load by
      // path through `ort.env.wasm.wasmPaths`. The extern entry imports the
      // factory from that same path at runtime instead (#34).
      //
      // Spread rather than replace: this list overrides Vite's defaults
      // wholesale, and dropping `browser` alone would resolve packages to their
      // Node builds.
      conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
    },
    build: {
      // The tokenizer and provider bootstrap live in the classifier worker.
      // Keep the ceiling tight so unexpected runtime growth remains visible.
      chunkSizeWarningLimit: 120,
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
    // CPU/WASM fallback may use a small, bounded thread pool. `credentialless`
    // preserves cross-origin isolation without requiring public model hosts to
    // emit CORP on every metadata response; hosted install is covered by QA.
    cross_origin_embedder_policy: {
      value: 'credentialless',
    },
    cross_origin_opener_policy: {
      value: 'same-origin',
    },
    web_accessible_resources: [
      {
        resources: ['ort/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
})
