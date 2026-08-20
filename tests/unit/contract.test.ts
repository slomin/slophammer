import { describe, expect, it } from 'vitest'
import { validateContract, validateSupportedContract } from '@/llm/contract'

const supported = {
  n_buckets: 4,
  max_seq_length: 512,
  preprocessing: 'trim+zw',
  preprocessing_js: 'throw new Error("must never run")',
  calibration: { tau: 3.8088, abstain_band: 1.5 },
  labels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  pad_token_id: 0,
  padding_side: 'left',
  output_name: 'logits',
  base_model: 'LiquidAI/LFM2.5-350M-Base',
  version: 'SlopHammer 350M v0.1',
}

describe('validateContract', () => {
  it('accepts the shipping contract and ignores documentation-only preprocessing_js', () => {
    expect(() => validateContract(supported)).not.toThrow()
  })

  it.each([
    ['preprocessing', { preprocessing: 'eval-js' }],
    ['labels', { labels: ['Human'] }],
    ['calibration', { calibration: undefined }],
    ['calibration.tau', { calibration: { tau: '3.8', abstain_band: 1.5 } }],
    ['calibration.abstain_band', { calibration: { tau: 3.8, abstain_band: -1 } }],
    ['min_words', { min_words: 0 }],
  ])('rejects invalid %s', (_name, patch) => {
    expect(() => validateContract({ ...supported, ...patch })).toThrow()
  })

  it('accepts an optional 40-word contract floor', () => {
    expect(() => validateContract({ ...supported, min_words: 40 })).not.toThrow()
  })
})
describe('validateSupportedContract', () => {
  it('accepts only the exact supported artifact identity', () => {
    expect(() => validateSupportedContract(supported)).not.toThrow()
  })

  it.each([
    ['retired contract', { version: 'Slop Hammer 0.8B v0.1' }],
    ['retired base model', { base_model: 'Qwen/Qwen3.5-0.8B-Base' }],
    ['different padding', { pad_token_id: 248044 }],
    ['future word floor', { min_words: 41 }],
    ['changed labels', { labels: ['Human', 'Lightly AI', 'Moderately AI', 'Heavily AI'] }],
    ['changed calibration tau', { calibration: { tau: 3.8089, abstain_band: 1.5 } }],
    ['changed abstain band', { calibration: { tau: 3.8088, abstain_band: 1.5001 } }],
  ])('rejects %s', (_name, patch) => {
    expect(() => validateSupportedContract({ ...supported, ...patch })).toThrow(/supported|match|expected/i)
  })
})
