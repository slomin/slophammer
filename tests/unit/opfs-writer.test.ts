import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpfsWriter } from '@/install/opfs-writer'

function domError(name: string): Error {
  const err = new Error(name)
  err.name = name
  return err
}

/**
 * Minimal OPFS root. `removeEntry` is the seam under test; `getDirectoryHandle`
 * only has to be well-behaved enough for the directory to be recreated after.
 */
function fakeStorage(removeEntry: () => Promise<void>) {
  const dir = {
    getDirectoryHandle: vi.fn(async () => dir),
    getFileHandle: vi.fn(),
  }
  const root = { removeEntry: vi.fn(removeEntry), getDirectoryHandle: vi.fn(async () => dir) }
  Object.defineProperty(navigator, 'storage', {
    value: { getDirectory: async () => root },
    configurable: true,
  })
  return root
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage')
})

describe('OpfsWriter.resetModelDir', () => {
  it('treats a missing directory as the normal first-install case', async () => {
    const root = fakeStorage(async () => {
      throw domError('NotFoundError')
    })
    await expect(new OpfsWriter().resetModelDir()).resolves.toBeUndefined()
    expect(root.removeEntry).toHaveBeenCalledOnce()
  })

  it('removes an existing directory', async () => {
    const root = fakeStorage(async () => {})
    await new OpfsWriter().resetModelDir()
    expect(root.removeEntry).toHaveBeenCalledWith('slop-hammer', { recursive: true })
  })

  it('fails loudly when the old model could not be removed', async () => {
    // Swallowing this would write the new model's files over the old ones.
    // loadAllModelFiles walks data_0…data_N until the first gap, so a model
    // with fewer shards than its predecessor would load a stale shard
    // alongside fresh ones and hand ONNX Runtime mixed weights.
    fakeStorage(async () => {
      throw domError('NoModificationAllowedError')
    })
    await expect(new OpfsWriter().resetModelDir()).rejects.toThrow('NoModificationAllowedError')
  })
})
