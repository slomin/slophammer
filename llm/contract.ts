export interface SlopHammerContract {
  n_buckets: number
  lo_threshold: number
  hi_threshold: number
  max_seq_length: number
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
  if (typeof k.lo_threshold !== 'number') {
    throw new Error('Missing lo_threshold')
  }
  if (typeof k.hi_threshold !== 'number') {
    throw new Error('Missing hi_threshold')
  }
}
