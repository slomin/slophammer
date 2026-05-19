import {
  CONTRACT_FILENAMES,
  CORE_MODEL_FILES,
  OPTIONAL_MODEL_FILES,
  SHARD_FILENAME_PATTERN,
} from '@/llm/contract'

const CORE_SET = new Set<string>(CORE_MODEL_FILES)
const CONTRACT_SET = new Set<string>(CONTRACT_FILENAMES)
const OPTIONAL_SET = new Set<string>(OPTIONAL_MODEL_FILES)

export function isKnownModelFile(name: string): boolean {
  if (!name || name.includes('/')) return false
  if (CORE_SET.has(name)) return true
  if (CONTRACT_SET.has(name)) return true
  if (OPTIONAL_SET.has(name)) return true
  return SHARD_FILENAME_PATTERN.test(name)
}

export function assertRequiredFiles(seen: ReadonlySet<string>): string {
  for (const f of CORE_MODEL_FILES) {
    if (!seen.has(f)) {
      throw new Error(`Zip is missing required file: ${f}`)
    }
  }
  const contract = CONTRACT_FILENAMES.find((n) => seen.has(n))
  if (!contract) {
    throw new Error(
      `Zip is missing a contract file (expected one of: ${CONTRACT_FILENAMES.join(', ')})`,
    )
  }
  const hasShard = [...seen].some((n) => SHARD_FILENAME_PATTERN.test(n))
  if (!hasShard) {
    throw new Error('Zip is missing model data shards (model_q4f16.onnx.data_*)')
  }
  return contract
}
