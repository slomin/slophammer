export interface DownloadProgress {
  downloadedBytes: number
  totalBytes: number
}

export interface FetchZipWithProgressArgs {
  url: string
  expectedSha256: string
  onProgress: (p: DownloadProgress) => void
  fetcher?: typeof fetch
}

export interface FetchZipWithProgressResult {
  blob: Blob
  sha256: string
}

export class DownloadChecksumMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Downloaded file checksum mismatch (expected ${expected}, got ${actual})`)
    this.name = 'DownloadChecksumMismatchError'
  }
}

export async function fetchZipWithProgress(
  args: FetchZipWithProgressArgs,
): Promise<FetchZipWithProgressResult> {
  const fetcher = args.fetcher ?? fetch
  const response = await fetcher(args.url)
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  }
  const body = response.body
  if (!body) throw new Error('Download failed: response has no body')

  const totalHeader = response.headers.get('content-length')
  const totalBytes = totalHeader ? Number(totalHeader) || 0 : 0

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let downloaded = 0
  args.onProgress({ downloadedBytes: 0, totalBytes })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.length
    args.onProgress({ downloadedBytes: downloaded, totalBytes })
  }

  const merged = new Uint8Array(downloaded)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const digest = await crypto.subtle.digest('SHA-256', merged as unknown as BufferSource)
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (sha256 !== args.expectedSha256) {
    throw new DownloadChecksumMismatchError(args.expectedSha256, sha256)
  }

  return { blob: new Blob([merged as unknown as BlobPart], { type: 'application/zip' }), sha256 }
}
