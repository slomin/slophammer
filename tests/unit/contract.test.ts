import { describe, expect, it } from 'vitest'
import {
  CONTRACT_FILENAMES,
  CORE_MODEL_FILES,
  validateContract,
} from '@/llm/contract'

describe('validateContract', () => {
  it('accepts a minimal valid contract', () => {
    const c = { n_buckets: 4, max_seq_length: 512, lo_threshold: 0.1, hi_threshold: 0.9 }
    expect(() => validateContract(c)).not.toThrow()
  })

  it('accepts a full contract with optional fields', () => {
    const c = {
      n_buckets: 4,
      max_seq_length: 512,
      lo_threshold: 0.2,
      hi_threshold: 0.8,
      labels: ['Human', 'Lightly', 'Moderately', 'Heavily'],
      pad_token_id: 0,
      padding_side: 'left',
      session_count: 1,
      input_names: ['input_ids', 'attention_mask'],
      output_name: 'logits',
      base_model: 'gemma',
      version: '4500',
    }
    expect(() => validateContract(c)).not.toThrow()
  })

  it('rejects null / undefined / non-object', () => {
    expect(() => validateContract(null)).toThrow(/not an object/i)
    expect(() => validateContract(undefined)).toThrow(/not an object/i)
    expect(() => validateContract('{}')).toThrow(/not an object/i)
  })

  it('rejects n_buckets ≠ 4', () => {
    expect(() =>
      validateContract({ n_buckets: 2, max_seq_length: 512, lo_threshold: 0, hi_threshold: 1 }),
    ).toThrow(/n_buckets/)
  })

  it('rejects missing/invalid max_seq_length', () => {
    expect(() =>
      validateContract({ n_buckets: 4, lo_threshold: 0, hi_threshold: 1 }),
    ).toThrow(/max_seq_length/)
    expect(() =>
      validateContract({ n_buckets: 4, max_seq_length: 0, lo_threshold: 0, hi_threshold: 1 }),
    ).toThrow(/max_seq_length/)
  })

  // The shipping model sets these, but nothing in the extension reads them,
  // so their absence must not reject an otherwise-valid model.
  it('accepts a contract without the calibration thresholds', () => {
    expect(() => validateContract({ n_buckets: 4, max_seq_length: 512 })).not.toThrow()
    expect(() =>
      validateContract({ n_buckets: 4, max_seq_length: 512, hi_threshold: 0.9 }),
    ).not.toThrow()
  })

  it('still rejects thresholds of the wrong type', () => {
    expect(() =>
      validateContract({ n_buckets: 4, max_seq_length: 512, lo_threshold: 'low' }),
    ).toThrow(/lo_threshold/)
    expect(() =>
      validateContract({ n_buckets: 4, max_seq_length: 512, hi_threshold: [] }),
    ).toThrow(/hi_threshold/)
  })
})

describe('constants', () => {
  it('exports stable contract filenames', () => {
    expect(CONTRACT_FILENAMES).toContain('slop_hammer_contract.json')
    expect(CONTRACT_FILENAMES).toContain('seq_cls_contract.json')
  })

  it('exports core model files including q4f16 onnx + tokenizer', () => {
    expect(CORE_MODEL_FILES).toContain('tokenizer.json')
    expect(CORE_MODEL_FILES).toContain('tokenizer_config.json')
    expect(CORE_MODEL_FILES).toContain('model_q4f16.onnx')
  })
})
