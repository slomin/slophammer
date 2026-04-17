import { describe, expect, it } from 'vitest'
import { isKnownModelFile, assertRequiredFiles } from '@/install/file-recognition'

describe('isKnownModelFile', () => {
  it('accepts core model files', () => {
    expect(isKnownModelFile('tokenizer.json')).toBe(true)
    expect(isKnownModelFile('tokenizer_config.json')).toBe(true)
    expect(isKnownModelFile('model_q4f16.onnx')).toBe(true)
  })

  it('accepts either contract filename', () => {
    expect(isKnownModelFile('slop_hammer_contract.json')).toBe(true)
    expect(isKnownModelFile('seq_cls_contract.json')).toBe(true)
  })

  it('accepts optional files', () => {
    expect(isKnownModelFile('config.json')).toBe(true)
    expect(isKnownModelFile('README.md')).toBe(true)
    expect(isKnownModelFile('sanity_examples.json')).toBe(true)
    expect(isKnownModelFile('special_tokens_map.json')).toBe(true)
  })

  it('accepts data shards with the expected pattern', () => {
    expect(isKnownModelFile('model_q4f16.onnx.data_0')).toBe(true)
    expect(isKnownModelFile('model_q4f16.onnx.data_1')).toBe(true)
    expect(isKnownModelFile('model_q4f16.onnx.data_42')).toBe(true)
  })

  it('rejects mis-spellings and unexpected names', () => {
    expect(isKnownModelFile('model_q4f16.onnx.data_')).toBe(false) // no digits
    expect(isKnownModelFile('model_q4f16.onnx.data_a')).toBe(false)
    expect(isKnownModelFile('readme.md')).toBe(false) // case-sensitive
    expect(isKnownModelFile('evil.exe')).toBe(false)
    expect(isKnownModelFile('model_q4f32.onnx')).toBe(false)
    expect(isKnownModelFile('')).toBe(false)
  })

  it('rejects nested paths (zip entries with directories)', () => {
    expect(isKnownModelFile('subdir/tokenizer.json')).toBe(false)
  })
})

describe('assertRequiredFiles', () => {
  const minimumSet = (extras: string[] = []) =>
    new Set([
      'tokenizer.json',
      'tokenizer_config.json',
      'model_q4f16.onnx',
      'slop_hammer_contract.json',
      'model_q4f16.onnx.data_0',
      ...extras,
    ])

  it('passes when every core file, a contract, and at least one shard are present', () => {
    expect(() => assertRequiredFiles(minimumSet())).not.toThrow()
  })

  it('accepts the alternate contract filename', () => {
    const s = minimumSet()
    s.delete('slop_hammer_contract.json')
    s.add('seq_cls_contract.json')
    expect(() => assertRequiredFiles(s)).not.toThrow()
  })

  it('throws when a core file is missing', () => {
    const s = minimumSet()
    s.delete('tokenizer.json')
    expect(() => assertRequiredFiles(s)).toThrow(/tokenizer\.json/)
  })

  it('throws when no contract is present', () => {
    const s = minimumSet()
    s.delete('slop_hammer_contract.json')
    expect(() => assertRequiredFiles(s)).toThrow(/contract/i)
  })

  it('throws when no data shard is present', () => {
    const s = minimumSet()
    s.delete('model_q4f16.onnx.data_0')
    expect(() => assertRequiredFiles(s)).toThrow(/shard/i)
  })

  it('returns the discovered contract filename for callers', () => {
    const s = minimumSet()
    expect(assertRequiredFiles(s)).toBe('slop_hammer_contract.json')

    const s2 = minimumSet()
    s2.delete('slop_hammer_contract.json')
    s2.add('seq_cls_contract.json')
    expect(assertRequiredFiles(s2)).toBe('seq_cls_contract.json')
  })
})
