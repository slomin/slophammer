import { describe, expect, it } from 'vitest'
import { chooseWasmThreadCount } from '@/llm/wasm-runtime'

describe('WASM runtime configuration', () => {
  it('stays single-threaded when the worker is not cross-origin isolated', () => {
    expect(chooseWasmThreadCount({ crossOriginIsolated: false, hardwareConcurrency: 16 })).toBe(1)
  })

  it.each([
    [undefined, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [4, 2],
    [8, 4],
    [32, 4],
  ])('uses a bounded half-core policy for %s logical cores', (hardwareConcurrency, expected) => {
    expect(
      chooseWasmThreadCount({ crossOriginIsolated: true, hardwareConcurrency }),
    ).toBe(expected)
  })
})
