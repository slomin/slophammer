import { describe, expect, it } from 'vitest'
import { extractLogits } from '@/llm/logits-extraction'

describe('extractLogits', () => {
  it('extracts from Float32Array', () => {
    const arr = new Float32Array([1.5, -0.5, 2.25, 0.75])
    expect(extractLogits(arr)).toEqual([1.5, -0.5, 2.25, 0.75])
  })

  it('extracts from Uint16Array (fp16 bits)', () => {
    // 0x3c00=1.0, 0xbc00=-1.0, 0x4000=2.0, 0x0000=0
    const arr = new Uint16Array([0x3c00, 0xbc00, 0x4000, 0x0000])
    const [a, b, c, d] = extractLogits(arr)
    expect(a).toBeCloseTo(1.0)
    expect(b).toBeCloseTo(-1.0)
    expect(c).toBeCloseTo(2.0)
    expect(d).toBe(0)
  })

  it('extracts from Float16Array (when available, index access auto-upcasts)', () => {
    if (typeof (globalThis as unknown as { Float16Array?: unknown }).Float16Array !== 'function') {
      // Not available in this Node version — skip
      return
    }
    const F16 = (globalThis as unknown as { Float16Array: Float32ArrayConstructor }).Float16Array
    const arr = new F16([1.5, -0.5, 2.25, 0.75])
    const out = extractLogits(arr as unknown as ArrayBufferView)
    expect(out[0]).toBeCloseTo(1.5, 2)
    expect(out[1]).toBeCloseTo(-0.5, 2)
    expect(out[2]).toBeCloseTo(2.25, 2)
    expect(out[3]).toBeCloseTo(0.75, 2)
  })

  it('throws when the tensor has the wrong length', () => {
    const short = new Float32Array([1, 2, 3])
    expect(() => extractLogits(short)).toThrow(/4 logits/i)

    const long = new Uint16Array([1, 2, 3, 4, 5])
    expect(() => extractLogits(long)).toThrow(/4/i)
  })

  it('throws on unsupported array type', () => {
    const bad = new Int32Array([1, 2, 3, 4])
    expect(() => extractLogits(bad as unknown as ArrayBufferView)).toThrow(/unsupported|unexpected/i)
  })
})
