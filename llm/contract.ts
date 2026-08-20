import { SUPPORTED_ARTIFACT } from './supported-artifact'

export interface SlopHammerContract {
  n_buckets: number
  max_seq_length: number
  preprocessing: 'trim+zw'
  calibration: {
    tau: number
    abstain_band: number
  }
  min_words?: number
  lo_threshold?: number
  hi_threshold?: number
  base_model?: string
  version?: string
  labels: string[]
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
  if (k.preprocessing !== 'trim+zw') {
    throw new Error(`Unsupported preprocessing: ${String(k.preprocessing)}`)
  }
  if (!Array.isArray(k.labels) || k.labels.length !== 4 || k.labels.some((v) => typeof v !== 'string')) {
    throw new Error('Contract must declare exactly four bucket labels')
  }
  const calibration = k.calibration as Record<string, unknown> | null
  if (!calibration || typeof calibration !== 'object') {
    throw new Error('Contract calibration is missing')
  }
  if (typeof calibration.tau !== 'number' || !Number.isFinite(calibration.tau)) {
    throw new Error(`Invalid calibration.tau: ${String(calibration.tau)}`)
  }
  if (
    typeof calibration.abstain_band !== 'number' ||
    !Number.isFinite(calibration.abstain_band) ||
    calibration.abstain_band < 0
  ) {
    throw new Error(`Invalid calibration.abstain_band: ${String(calibration.abstain_band)}`)
  }
  if (k.min_words !== undefined && (!Number.isInteger(k.min_words) || (k.min_words as number) < 1)) {
    throw new Error(`Invalid min_words: ${String(k.min_words)}`)
  }
  if (k.lo_threshold !== undefined && typeof k.lo_threshold !== 'number') {
    throw new Error(`Invalid lo_threshold: ${String(k.lo_threshold)}`)
  }
  if (k.hi_threshold !== undefined && typeof k.hi_threshold !== 'number') {
    throw new Error(`Invalid hi_threshold: ${String(k.hi_threshold)}`)
  }
}

export function validateSupportedContract(c: unknown): asserts c is SlopHammerContract {
  validateContract(c)
  if (c.version !== SUPPORTED_ARTIFACT.contractVersion) {
    throw new Error(
      `Unsupported model contract '${String(c.version)}'. Install ${SUPPORTED_ARTIFACT.contractVersion}.`,
    )
  }
  if (c.base_model !== SUPPORTED_ARTIFACT.baseModel) {
    throw new Error(
      `Unsupported base model '${String(c.base_model)}'. Install ${SUPPORTED_ARTIFACT.contractVersion}.`,
    )
  }
  if (
    c.max_seq_length !== 512 ||
    c.pad_token_id !== 0 ||
    c.padding_side !== 'left' ||
    c.output_name !== 'logits'
  ) {
    throw new Error('The model runtime contract does not match the supported 350M artifact.')
  }
  if (c.labels.some((label, index) => label !== SUPPORTED_ARTIFACT.labels[index])) {
    throw new Error('The model bucket labels do not match the supported 350M artifact.')
  }
  if (
    c.calibration.tau !== SUPPORTED_ARTIFACT.calibration.tau ||
    c.calibration.abstain_band !== SUPPORTED_ARTIFACT.calibration.abstainBand
  ) {
    throw new Error('The model calibration does not match the supported 350M artifact.')
  }
  if (c.min_words !== undefined && c.min_words !== SUPPORTED_ARTIFACT.minWords) {
    throw new Error(`Unsupported min_words=${c.min_words}; expected ${SUPPORTED_ARTIFACT.minWords}.`)
  }
}
