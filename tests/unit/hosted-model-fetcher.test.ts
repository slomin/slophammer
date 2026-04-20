import { describe, expect, it, vi } from 'vitest'
import {
  DownloadChecksumMismatchError,
  fetchZipWithProgress,
  type DownloadProgress,
} from '@/install/hosted-model-fetcher'

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[i]!)
      i += 1
    },
  })
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fakeResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  return new Response(streamFromChunks(chunks), {
    status: 200,
    headers: { ...headers },
  })
}

describe('fetchZipWithProgress', () => {
  it('streams bytes, emits progress, and returns a verified blob', async () => {
    const chunks = [
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([6, 7, 8]),
      new Uint8Array([9]),
    ]
    const total = chunks.reduce((a, c) => a + c.length, 0)
    const full = new Uint8Array(total)
    {
      let o = 0
      for (const c of chunks) {
        full.set(c, o)
        o += c.length
      }
    }
    const sha = await sha256Hex(full)
    const progress: DownloadProgress[] = []

    const fakeFetch = vi
      .fn()
      .mockResolvedValue(fakeResponse(chunks, { 'content-length': String(total) }))

    const result = await fetchZipWithProgress({
      url: 'https://example.test/zip',
      expectedSha256: sha,
      onProgress: (p) => progress.push(p),
      fetcher: fakeFetch as unknown as typeof fetch,
    })

    expect(fakeFetch).toHaveBeenCalledWith('https://example.test/zip')
    expect(result.blob.size).toBe(total)
    expect(result.sha256).toBe(sha)
    expect(progress.length).toBeGreaterThanOrEqual(chunks.length)
    expect(progress.at(-1)).toEqual({ downloadedBytes: total, totalBytes: total })
  })

  it('reports totalBytes=0 when Content-Length is missing', async () => {
    const chunks = [new Uint8Array([1, 2, 3])]
    const sha = await sha256Hex(chunks[0]!)
    const progress: DownloadProgress[] = []
    const fakeFetch = vi.fn().mockResolvedValue(fakeResponse(chunks))

    await fetchZipWithProgress({
      url: 'https://example.test/zip',
      expectedSha256: sha,
      onProgress: (p) => progress.push(p),
      fetcher: fakeFetch as unknown as typeof fetch,
    })

    expect(progress.at(-1)?.totalBytes).toBe(0)
    expect(progress.at(-1)?.downloadedBytes).toBe(3)
  })

  it('throws DownloadChecksumMismatchError when SHA does not match', async () => {
    const chunks = [new Uint8Array([1, 2, 3])]
    const fakeFetch = vi.fn().mockResolvedValue(fakeResponse(chunks))
    const promise = fetchZipWithProgress({
      url: 'https://example.test/zip',
      expectedSha256: 'deadbeef'.repeat(8),
      onProgress: () => {},
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    await expect(promise).rejects.toBeInstanceOf(DownloadChecksumMismatchError)
  })

  it('propagates non-OK HTTP responses as errors', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(new Response('no', { status: 500, statusText: 'Server Error' }))
    const promise = fetchZipWithProgress({
      url: 'https://example.test/zip',
      expectedSha256: 'x',
      onProgress: () => {},
      fetcher: fakeFetch as unknown as typeof fetch,
    })
    await expect(promise).rejects.toThrow(/500/)
  })
})
