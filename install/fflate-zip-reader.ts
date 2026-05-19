import { Unzip, UnzipInflate } from 'fflate'
import type { ZipEntry, ZipReaderLike } from './install-orchestrator'

export class FflateZipReader implements ZipReaderLike {
  private bytesRead = 0
  constructor(private readonly file: File) {}

  totalBytes(): number {
    return this.file.size
  }
  readBytes(): number {
    return this.bytesRead
  }

  async *entries(): AsyncIterable<ZipEntry> {
    const queue: ZipEntry[] = []
    const pending: Array<(e: ZipEntry | null) => void> = []
    let streamDone = false

    const deliver = (entry: ZipEntry | null) => {
      const w = pending.shift()
      if (w) w(entry)
      else if (entry) queue.push(entry)
    }

    const unzip = new Unzip((file) => {
      const chunks: Uint8Array[] = []
      const bytesPromise = new Promise<Uint8Array>((resolve, reject) => {
        file.ondata = (err, chunk, final) => {
          if (err) {
            reject(err)
            return
          }
          chunks.push(chunk)
          if (final) {
            let total = 0
            for (const c of chunks) total += c.length
            const merged = new Uint8Array(total)
            let offset = 0
            for (const c of chunks) {
              merged.set(c, offset)
              offset += c.length
            }
            resolve(merged)
          }
        }
      })
      file.start()
      deliver({ name: file.name, readAll: () => bytesPromise })
    })
    unzip.register(UnzipInflate)

    const reader = this.file.stream().getReader()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            unzip.push(new Uint8Array(), true)
            break
          }
          unzip.push(value, false)
          this.bytesRead += value.length
        }
      } finally {
        streamDone = true
        deliver(null)
      }
    })().catch(() => {
      streamDone = true
      deliver(null)
    })

    while (true) {
      const buffered = queue.shift()
      if (buffered) {
        yield buffered
        continue
      }
      if (streamDone) return
      const next = await new Promise<ZipEntry | null>((resolve) => pending.push(resolve))
      if (next == null) return
      yield next
    }
  }
}
