import { MODEL_ROOT_DIR, MODEL_SUBDIR, SENTINEL_NAME } from '@/llm/opfs-model-reader'
import type { OpfsAdapterLike, StorageMarkerLike } from './install-orchestrator'

async function modelParentDir(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(MODEL_ROOT_DIR, { create })
}

async function modelDir(create: boolean): Promise<FileSystemDirectoryHandle> {
  const parent = await modelParentDir(create)
  return parent.getDirectoryHandle(MODEL_SUBDIR, { create })
}

export class OpfsWriter implements OpfsAdapterLike {
  async resetModelDir(): Promise<void> {
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry(MODEL_ROOT_DIR, { recursive: true })
    } catch (err) {
      // Nothing to remove is the normal first-install case. Anything else has
      // to be fatal: replacing a model is the one flow where the directory is
      // guaranteed to exist, and writes here are per-file with `create: true`.
      // Swallowing a real failure would leave the previous model's files in
      // place and write the new ones over them — and `loadAllModelFiles` walks
      // `data_0…data_N` until the first gap, so a model with fewer shards than
      // its predecessor would silently load new shard 0 alongside a stale
      // shard 1.
      if ((err as { name?: string } | null)?.name !== 'NotFoundError') throw err
    }
    await modelDir(true)
  }

  async writeFile(name: string, data: Uint8Array): Promise<void> {
    const dir = await modelDir(true)
    const handle = await dir.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    // The DOM type wants ArrayBuffer-backed views; our Uint8Array is always
    // that at runtime but TS narrows to ArrayBufferLike. Cast to BufferSource.
    await writable.write(data as unknown as BufferSource)
    await writable.close()
  }

  async readTextFile(name: string): Promise<string> {
    const dir = await modelDir(false)
    const handle = await dir.getFileHandle(name, { create: false })
    return (await handle.getFile()).text()
  }

  async writeSentinel(text: string): Promise<void> {
    const parent = await modelParentDir(true)
    const handle = await parent.getFileHandle(SENTINEL_NAME, { create: true })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
  }
}

export async function wipeModelFiles(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  try {
    await root.removeEntry(MODEL_ROOT_DIR, { recursive: true })
  } catch (err) {
    if ((err as { name?: string } | null)?.name !== 'NotFoundError') throw err
  }
}

export async function wipeModel(): Promise<void> {
  await wipeModelFiles()
  await chrome.storage.local.remove(['model_installed', 'checkpoint_id'])
}

export class ChromeStorageMarker implements StorageMarkerLike {
  async setInstalled(checkpointId: string): Promise<void> {
    await chrome.storage.local.set({ model_installed: true, checkpoint_id: checkpointId })
  }
  async persistStorage(): Promise<void> {
    try {
      await navigator.storage.persist?.()
    } catch {
      // best-effort
    }
  }
}
