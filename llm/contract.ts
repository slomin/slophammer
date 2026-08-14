export interface SlopHammerContract {
  n_buckets: number
  max_seq_length: number
  /**
   * Training-side calibration metadata, on a 0–1 scale. Nothing in the
   * extension consumes these: the card's verdict comes from the argmax of the
   * four buckets, and its HIGH/MED/LOW bands are presentation thresholds on a
   * 0–100 collapsed percentage — a different quantity on a different scale.
   * Applying 0.03 / 0.15 to that percentage would label almost everything AI.
   * They are recorded when present but must not be treated as verdict
   * thresholds without a model-side definition of what they threshold.
   */
  lo_threshold?: number
  hi_threshold?: number
  base_model?: string
  version?: string
  labels?: string[]
  pad_token_id?: number
  padding_side?: 'left' | 'right'
  session_count?: number
  input_names?: string[]
  output_name?: string
}

export const CONTRACT_FILENAMES = [
  'slop_hammer_contract.json',
  'seq_cls_contract.json',
] as const

export const CORE_MODEL_FILES = [
  'tokenizer.json',
  'tokenizer_config.json',
  'model_q4f16.onnx',
] as const

export const OPTIONAL_MODEL_FILES = [
  'config.json',
  'README.md',
  'sanity_examples.json',
  'special_tokens_map.json',
] as const

export const SHARD_FILENAME_PATTERN = /^model_q4f16\.onnx\.data_\d+$/

export function validateContract(c: unknown): asserts c is SlopHammerContract {
  if (!c || typeof c !== 'object') {
    throw new Error('Contract is not an object')
  }
  const k = c as Record<string, unknown>
  if (k.n_buckets !== 4) {
    throw new Error(`Expected n_buckets=4, got ${String(k.n_buckets)}`)
  }
  if (typeof k.max_seq_length !== 'number' || k.max_seq_length < 1) {
    throw new Error(`Invalid max_seq_length: ${String(k.max_seq_length)}`)
  }
  // Validated only when present. Requiring fields the runtime never reads
  // rejected otherwise-valid models while protecting nothing; n_buckets and
  // max_seq_length are the load-bearing checks.
  if (k.lo_threshold !== undefined && typeof k.lo_threshold !== 'number') {
    throw new Error(`Invalid lo_threshold: ${String(k.lo_threshold)}`)
  }
  if (k.hi_threshold !== undefined && typeof k.hi_threshold !== 'number') {
    throw new Error(`Invalid hi_threshold: ${String(k.hi_threshold)}`)
  }
}
