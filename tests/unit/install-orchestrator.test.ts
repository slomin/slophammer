import { describe, expect, it, vi } from 'vitest'
import {
  runInstall,
  type OpfsAdapterLike,
  type StorageMarkerLike,
  type ZipEntry,
  type ZipReaderLike,
} from '@/install/install-orchestrator'

const VALID_CONTRACT = {
  n_buckets: 4,
  max_seq_length: 512,
  lo_threshold: 0.1,
  hi_threshold: 0.9,
  version: 'ckpt4500',
}

function entry(name: string, data: Uint8Array | string): ZipEntry {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return { name, readAll: async () => bytes }
}

function makeZip(entries: ZipEntry[]): ZipReaderLike {
  let bytes = 0
  const total = entries.reduce((a, e) => a + 1, 0) // byte count is stubbed; use entry count
  return {
    async *entries() {
      for (const e of entries) {
        yield e
        bytes += 1
      }
    },
    readBytes: () => bytes,
    totalBytes: () => total,
  }
}

function makeOpfs() {
  const files = new Map<string, Uint8Array>()
  let sentinelText: string | null = null
  let resetCalls = 0
  const opfs: OpfsAdapterLike = {
    async resetModelDir() {
      resetCalls += 1
      files.clear()
    },
    async writeFile(name, data) {
      files.set(name, data)
    },
    async readTextFile(name) {
      const b = files.get(name)
      if (!b) throw new Error(`not found: ${name}`)
      return new TextDecoder().decode(b)
    },
    async writeSentinel(text) {
      sentinelText = text
    },
  }
  return { opfs, files, getSentinel: () => sentinelText, getResetCalls: () => resetCalls }
}

function makeStorage(): StorageMarkerLike & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async setInstalled(checkpointId) {
      calls.push(`setInstalled:${checkpointId}`)
    },
    async persistStorage() {
      calls.push('persistStorage')
    },
  }
}

const requiredHappyEntries: ZipEntry[] = [
  entry('tokenizer.json', '{"tok":true}'),
  entry('tokenizer_config.json', '{"cfg":true}'),
  entry('model_q4f16.onnx', new Uint8Array([1, 2, 3])),
  entry('model_q4f16.onnx.data_0', new Uint8Array([9, 9])),
  entry('slop_hammer_contract.json', JSON.stringify(VALID_CONTRACT)),
]

describe('runInstall — happy path', () => {
  it('writes required files, sentinel, storage', async () => {
    const { opfs, files, getSentinel, getResetCalls } = makeOpfs()
    const marks = makeStorage()
    const progress = vi.fn()

    const contract = await runInstall({
      reader: makeZip(requiredHappyEntries),
      opfs,
      marks,
      onProgress: progress,
    })

    expect(contract.version).toBe('ckpt4500')
    expect(files.has('tokenizer.json')).toBe(true)
    expect(files.has('model_q4f16.onnx')).toBe(true)
    expect(files.has('slop_hammer_contract.json')).toBe(true)
    expect(getResetCalls()).toBe(1)
    expect(getSentinel()).not.toBeNull()
    const parsed = JSON.parse(getSentinel()!)
    expect(parsed.checkpointId).toBe('ckpt4500')
    expect(parsed.contractFile).toBe('slop_hammer_contract.json')
    expect(marks.calls).toContain('setInstalled:ckpt4500')
    expect(marks.calls).toContain('persistStorage')
    expect(progress).toHaveBeenCalled()
  })

  it('skips unknown zip entries without failing', async () => {
    const { opfs, files } = makeOpfs()
    const marks = makeStorage()
    const entries = [
      ...requiredHappyEntries,
      entry('evil.exe', new Uint8Array([0])),
      entry('README.md', 'hi'),
    ]
    await runInstall({
      reader: makeZip(entries),
      opfs,
      marks,
      onProgress: () => {},
    })
    expect(files.has('evil.exe')).toBe(false)
    expect(files.has('README.md')).toBe(true)
  })

  it('records hosted metadata in the sentinel when provided', async () => {
    const { opfs, getSentinel } = makeOpfs()
    const marks = makeStorage()
    await runInstall({
      reader: makeZip(requiredHappyEntries),
      opfs,
      marks,
      onProgress: () => {},
      hostedMeta: {
        filename: 'slop_hammer_0_8b_v0_1.zip',
        lfsOid: 'abc123',
        url: 'https://huggingface.co/Slomin/slop_hammer_0_8_b/resolve/main/slop_hammer_0_8b_v0_1.zip',
      },
    })
    const parsed = JSON.parse(getSentinel()!)
    expect(parsed.source).toBe('hosted')
    expect(parsed.hosted).toEqual({
      filename: 'slop_hammer_0_8b_v0_1.zip',
      lfsOid: 'abc123',
      url: 'https://huggingface.co/Slomin/slop_hammer_0_8_b/resolve/main/slop_hammer_0_8b_v0_1.zip',
    })
  })

  it('writes a manual-source sentinel when hostedMeta is not supplied', async () => {
    const { opfs, getSentinel } = makeOpfs()
    const marks = makeStorage()
    await runInstall({
      reader: makeZip(requiredHappyEntries),
      opfs,
      marks,
      onProgress: () => {},
    })
    const parsed = JSON.parse(getSentinel()!)
    expect(parsed.source).toBe('manual')
    expect(parsed.hosted).toBeUndefined()
  })

  it('uses the alternate contract filename when present', async () => {
    const { opfs, files, getSentinel } = makeOpfs()
    const marks = makeStorage()
    const entries = requiredHappyEntries
      .filter((e) => e.name !== 'slop_hammer_contract.json')
      .concat(entry('seq_cls_contract.json', JSON.stringify({ ...VALID_CONTRACT, version: 'alt' })))
    await runInstall({
      reader: makeZip(entries),
      opfs,
      marks,
      onProgress: () => {},
    })
    expect(files.has('seq_cls_contract.json')).toBe(true)
    expect(JSON.parse(getSentinel()!).contractFile).toBe('seq_cls_contract.json')
  })
})

describe('runInstall — failure modes', () => {
  it('throws when a core file is missing', async () => {
    const { opfs } = makeOpfs()
    const marks = makeStorage()
    await expect(
      runInstall({
        reader: makeZip(requiredHappyEntries.filter((e) => e.name !== 'tokenizer.json')),
        opfs,
        marks,
        onProgress: () => {},
      }),
    ).rejects.toThrow(/tokenizer\.json/)
    expect(marks.calls).toEqual([])
  })

  it('throws when no shard is present', async () => {
    const { opfs } = makeOpfs()
    const marks = makeStorage()
    await expect(
      runInstall({
        reader: makeZip(requiredHappyEntries.filter((e) => !e.name.includes('.data_'))),
        opfs,
        marks,
        onProgress: () => {},
      }),
    ).rejects.toThrow(/shard/i)
  })

  it('throws with a helpful error when the contract JSON is invalid', async () => {
    const { opfs } = makeOpfs()
    const marks = makeStorage()
    const entries = requiredHappyEntries
      .filter((e) => e.name !== 'slop_hammer_contract.json')
      .concat(entry('slop_hammer_contract.json', '{not-json'))
    await expect(
      runInstall({
        reader: makeZip(entries),
        opfs,
        marks,
        onProgress: () => {},
      }),
    ).rejects.toThrow()
  })

  it('throws when the contract schema rejects the payload', async () => {
    const { opfs } = makeOpfs()
    const marks = makeStorage()
    const entries = requiredHappyEntries
      .filter((e) => e.name !== 'slop_hammer_contract.json')
      .concat(entry('slop_hammer_contract.json', JSON.stringify({ n_buckets: 2 })))
    await expect(
      runInstall({
        reader: makeZip(entries),
        opfs,
        marks,
        onProgress: () => {},
      }),
    ).rejects.toThrow(/n_buckets/)
  })
})
