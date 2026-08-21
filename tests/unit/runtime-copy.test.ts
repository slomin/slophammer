import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const liveRuntimeDocs = [
  'WORKFLOW.md',
  'docs/support.md',
  'docs/chrome-web-store-release.md',
  'docs/chrome-web-store-submission.md',
]

describe('runtime fallback documentation', () => {
  it.each(liveRuntimeDocs)('%s contains no stale WebGPU-only claim', (filename) => {
    const text = readFileSync(filename, 'utf8')
    expect(text).not.toMatch(/WebGPU[- ]only|no CPU(?:\/WASM)? fallback|requires WebGPU/i)
  })

  it.each([
    'docs/support.md',
    'docs/chrome-web-store-release.md',
    'docs/chrome-web-store-submission.md',
  ])('%s explains the local CPU fallback', (filename) => {
    const text = readFileSync(filename, 'utf8')
    expect(text).toMatch(/WebGPU/i)
    expect(text).toMatch(/CPU\/(?:WebAssembly|WASM)|CPU\/WebAssembly|CPU-WASM/i)
    expect(text).toMatch(/local|on the device/i)
    expect(text).toMatch(/slower|longer/i)
  })

  it('opts extension pages into isolation for bounded WASM threads', () => {
    const config = readFileSync('wxt.config.ts', 'utf8')
    expect(config).toContain("value: 'credentialless'")
    expect(config).toContain("value: 'same-origin'")
  })
})
