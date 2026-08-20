import { describe, expect, it, vi } from 'vitest'
import { checkHostedForUpdate } from '@/install/hf-update-checker'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

function response(entries: unknown[]): Response {
  return new Response(JSON.stringify(entries), { status: 200 })
}

const pinnedEntry = {
  path: SUPPORTED_ARTIFACT.filename,
  lfs: { oid: SUPPORTED_ARTIFACT.sha256, size: SUPPORTED_ARTIFACT.size },
}

describe('checkHostedForUpdate', () => {
  it('discovers only the pinned entry with exact LFS identity', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([
      pinnedEntry,
      { path: 'slophammer_350m_v9_9.zip', lfs: { oid: 'future', size: 1 } },
    ]))
    const result = await checkHostedForUpdate({ current: null, fetcher })
    expect(result).toEqual({
      hasUpdate: true,
      latest: {
        filename: SUPPORTED_ARTIFACT.filename,
        lfsOid: SUPPORTED_ARTIFACT.sha256,
        size: SUPPORTED_ARTIFACT.size,
        url: 'https://huggingface.co/Slomin/slophammer_350m/resolve/main/slophammer_350m_v0_1.zip',
      },
    })
    expect(fetcher).toHaveBeenCalledWith(SUPPORTED_ARTIFACT.treeApiUrl)
  })

  it('reports no update for an exact installed identity', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([pinnedEntry]))
    const result = await checkHostedForUpdate({
      current: { filename: SUPPORTED_ARTIFACT.filename, lfsOid: SUPPORTED_ARTIFACT.sha256 },
      fetcher,
    })
    expect(result.hasUpdate).toBe(false)
  })

  it.each([
    ['missing', []],
    ['wrong oid', [{ ...pinnedEntry, lfs: { ...pinnedEntry.lfs, oid: 'bad' } }]],
    ['wrong size', [{ ...pinnedEntry, lfs: { ...pinnedEntry.lfs, size: 1 } }]],
    ['not LFS', [{ path: SUPPORTED_ARTIFACT.filename, size: SUPPORTED_ARTIFACT.size }]],
  ])('rejects a %s pinned artifact', async (_name, entries) => {
    await expect(checkHostedForUpdate({ current: null, fetcher: vi.fn().mockResolvedValue(response(entries)) }))
      .rejects.toThrow(/pinned|checksum|size/i)
  })

  it('propagates HTTP failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Unavailable' }))
    await expect(checkHostedForUpdate({ current: null, fetcher })).rejects.toThrow(/503/)
  })
})
