import { describe, expect, it, vi } from 'vitest'
import { checkHostedForUpdate, type HostedInstalledState } from '@/install/hf-update-checker'

function mockTreeResponse(
  entries: Array<{ path: string; size?: number; oid?: string; lfs?: { oid: string; size: number } }>,
): Response {
  return new Response(JSON.stringify(entries), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const current: HostedInstalledState = {
  filename: 'slop_hammer_0_8b_v0_1.zip',
  lfsOid: 'aaaa1111',
}

describe('checkHostedForUpdate', () => {
  it('returns hasUpdate=false when installed matches the only available zip exactly', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockTreeResponse([
        { path: 'README.md', size: 200 },
        { path: 'slop_hammer_0_8b_v0_1.zip', lfs: { oid: 'aaaa1111', size: 412235539 } },
      ]),
    )
    const result = await checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(false)
    expect(result.latest?.filename).toBe('slop_hammer_0_8b_v0_1.zip')
    expect(result.latest?.lfsOid).toBe('aaaa1111')
    expect(result.latest?.url).toBe(
      'https://huggingface.co/Slomin/slop_hammer_0_8_b/resolve/main/slop_hammer_0_8b_v0_1.zip',
    )
  })

  it('detects a newer versioned filename', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockTreeResponse([
        { path: 'slop_hammer_0_8b_v0_1.zip', lfs: { oid: 'aaaa1111', size: 1 } },
        { path: 'slop_hammer_0_8b_v0_2.zip', lfs: { oid: 'bbbb2222', size: 2 } },
      ]),
    )
    const result = await checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(true)
    expect(result.latest?.filename).toBe('slop_hammer_0_8b_v0_2.zip')
    expect(result.latest?.lfsOid).toBe('bbbb2222')
  })

  it('detects an in-place oid change at the same filename', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockTreeResponse([
        { path: 'slop_hammer_0_8b_v0_1.zip', lfs: { oid: 'cccc3333', size: 1 } },
      ]),
    )
    const result = await checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(true)
    expect(result.latest?.lfsOid).toBe('cccc3333')
  })

  it('returns hasUpdate=true with latest when nothing is installed yet', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockTreeResponse([
        { path: 'slop_hammer_0_8b_v0_1.zip', lfs: { oid: 'aaaa1111', size: 1 } },
      ]),
    )
    const result = await checkHostedForUpdate({
      current: null,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(true)
    expect(result.latest?.filename).toBe('slop_hammer_0_8b_v0_1.zip')
  })

  it('returns hasUpdate=false and latest=null when no versioned zip is present', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(mockTreeResponse([{ path: 'README.md', size: 100 }]))
    const result = await checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(false)
    expect(result.latest).toBeNull()
  })

  it('skips entries without lfs oid (files stored directly)', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      mockTreeResponse([
        { path: 'slop_hammer_0_8b_v0_2.zip', size: 200 },
        { path: 'slop_hammer_0_8b_v0_1.zip', lfs: { oid: 'aaaa1111', size: 1 } },
      ]),
    )
    const result = await checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(result.hasUpdate).toBe(false)
    expect(result.latest?.filename).toBe('slop_hammer_0_8b_v0_1.zip')
  })

  it('propagates non-OK HTTP responses', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(new Response('no', { status: 503, statusText: 'Unavailable' }))
    const promise = checkHostedForUpdate({
      current,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    await expect(promise).rejects.toThrow(/503/)
  })

  it('calls the HF tree API at the Slomin/slop_hammer_0_8_b path', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(mockTreeResponse([]))
    await checkHostedForUpdate({
      current: null,
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://huggingface.co/api/models/Slomin/slop_hammer_0_8_b/tree/main',
    )
  })
})
