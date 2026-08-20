import { describe, expect, it, vi } from 'vitest'
import { resolveInstalledHostedState } from '@/install/update-current'
import type { SentinelPayload } from '@/install/sentinel'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

const manualSentinel: SentinelPayload = {
  checkpointId: SUPPORTED_ARTIFACT.contractVersion,
  installedAt: 1,
  contractFile: 'seq_cls_contract.json',
  source: 'manual',
}

describe('resolveInstalledHostedState', () => {
  it('maps an exact validated manual install to the pinned hosted identity', async () => {
    await expect(resolveInstalledHostedState({
      sentinel: manualSentinel,
      hasSupportedInstall: vi.fn().mockResolvedValue(true),
    })).resolves.toEqual({
      filename: SUPPORTED_ARTIFACT.filename,
      lfsOid: SUPPORTED_ARTIFACT.sha256,
    })
  })

  it('uses hosted metadata when the installed files are not the supported artifact', async () => {
    await expect(resolveInstalledHostedState({
      sentinel: {
        ...manualSentinel,
        source: 'hosted',
        hosted: { filename: 'older.zip', lfsOid: 'older-oid', url: 'https://example.test/older.zip' },
      },
      hasSupportedInstall: vi.fn().mockResolvedValue(false),
    })).resolves.toEqual({ filename: 'older.zip', lfsOid: 'older-oid' })
  })

  it('returns null when neither installed files nor sentinel identify a hosted artifact', async () => {
    await expect(resolveInstalledHostedState({
      sentinel: manualSentinel,
      hasSupportedInstall: vi.fn().mockResolvedValue(false),
    })).resolves.toBeNull()
  })

  it('recognises an exact OPFS install even when cached sentinel state is absent', async () => {
    await expect(resolveInstalledHostedState({
      sentinel: null,
      hasSupportedInstall: vi.fn().mockResolvedValue(true),
    })).resolves.toEqual({
      filename: SUPPORTED_ARTIFACT.filename,
      lfsOid: SUPPORTED_ARTIFACT.sha256,
    })
  })
})
