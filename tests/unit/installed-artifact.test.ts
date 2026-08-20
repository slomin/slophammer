import { describe, expect, it } from 'vitest'
import {
  hasSupportedInstalledArtifact,
  type InstalledArtifactReader,
} from '@/migration/installed-artifact'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

const contract = {
  n_buckets: 4,
  max_seq_length: 512,
  preprocessing: 'trim+zw',
  calibration: { tau: 3.8088, abstain_band: 1.5 },
  labels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
  pad_token_id: 0,
  padding_side: 'left',
  output_name: 'logits',
  base_model: 'LiquidAI/LFM2.5-350M-Base',
  version: 'SlopHammer 350M v0.1',
}

function reader(overrides: Partial<InstalledArtifactReader> = {}): InstalledArtifactReader {
  const files = new Set([
    'tokenizer.json', 'tokenizer_config.json', 'model_q4f16.onnx',
    'model_q4f16.onnx.data_0', 'seq_cls_contract.json',
  ])
  return {
    readSentinel: async () => JSON.stringify({
      checkpointId: SUPPORTED_ARTIFACT.contractVersion,
      installedAt: 1,
      contractFile: 'seq_cls_contract.json',
      source: 'manual',
    }),
    readModelText: async () => JSON.stringify(contract),
    modelFileExists: async (filename) => files.has(filename),
    ...overrides,
  }
}

describe('installed artifact migration bypass', () => {
  it('accepts an exact manually installed 350M artifact', async () => {
    await expect(hasSupportedInstalledArtifact(reader())).resolves.toBe(true)
  })

  it('accepts exact pinned hosted metadata', async () => {
    await expect(hasSupportedInstalledArtifact(reader({
      readSentinel: async () => JSON.stringify({
        checkpointId: SUPPORTED_ARTIFACT.contractVersion,
        installedAt: 1,
        contractFile: 'seq_cls_contract.json',
        source: 'hosted',
        hosted: {
          filename: SUPPORTED_ARTIFACT.filename,
          lfsOid: SUPPORTED_ARTIFACT.sha256,
          url: `https://huggingface.co/${SUPPORTED_ARTIFACT.repoId}/resolve/main/${SUPPORTED_ARTIFACT.filename}`,
        },
      }),
    }))).resolves.toBe(true)
  })

  it('rejects changed calibration, mismatched identity, and incomplete files', async () => {
    await expect(hasSupportedInstalledArtifact(reader({
      readModelText: async () => JSON.stringify({
        ...contract, calibration: { tau: 0, abstain_band: 99 },
      }),
    }))).resolves.toBe(false)
    await expect(hasSupportedInstalledArtifact(reader({
      readSentinel: async () => JSON.stringify({
        checkpointId: 'legacy', installedAt: 1, contractFile: 'seq_cls_contract.json', source: 'manual',
      }),
    }))).resolves.toBe(false)
    await expect(hasSupportedInstalledArtifact(reader({
      modelFileExists: async (filename) => filename !== 'model_q4f16.onnx.data_0',
    }))).resolves.toBe(false)
  })
})
