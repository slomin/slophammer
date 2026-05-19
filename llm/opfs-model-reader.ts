import { CONTRACT_FILENAMES } from './contract'

export const MODEL_ROOT_DIR = 'slop-hammer'
export const MODEL_SUBDIR = 'model'
export const SENTINEL_NAME = '.ready'
const MAX_DATA_SHARDS = 10

export interface ReadProgress {
  bytesRead: number
  totalBytes: number
  fileIndex: number
  fileCount: number
  currentFile: string
}

export interface LoadedModelFiles {
  tokenizerJson: string
  tokenizerConfigJson: string
  contractJson: string
  contractFileName: string
  modelOnnx: ArrayBuffer
  modelDataShards: Array<{ path: string; data: ArrayBuffer }>
}

async function modelDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  const shDir = await root.getDirectoryHandle(MODEL_ROOT_DIR, { create: false })
  return shDir.getDirectoryHandle(MODEL_SUBDIR, { create: false })
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name, { create: false })
    return true
  } catch {
    return false
  }
}

async function readBuf(dir: FileSystemDirectoryHandle, name: string): Promise<ArrayBuffer> {
  const h = await dir.getFileHandle(name, { create: false })
  return (await h.getFile()).arrayBuffer()
}

async function readTxt(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const h = await dir.getFileHandle(name, { create: false })
  return (await h.getFile()).text()
}

export async function isModelInstalled(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory()
    const shDir = await root.getDirectoryHandle(MODEL_ROOT_DIR, { create: false })
    await shDir.getFileHandle(SENTINEL_NAME, { create: false })
    return true
  } catch {
    return false
  }
}

export async function loadAllModelFiles(
  onProgress?: (p: ReadProgress) => void,
): Promise<LoadedModelFiles> {
  const dir = await modelDir()

  let contractFileName: string | null = null
  for (const name of CONTRACT_FILENAMES) {
    if (await exists(dir, name)) {
      contractFileName = name
      break
    }
  }
  if (!contractFileName) {
    throw new Error('No contract file found in OPFS')
  }

  const shardNames: string[] = []
  for (let i = 0; i < MAX_DATA_SHARDS; i++) {
    const name = `model_q4f16.onnx.data_${i}`
    if (await exists(dir, name)) {
      shardNames.push(name)
    } else {
      break
    }
  }
  if (shardNames.length === 0) {
    throw new Error('No model data shards found in OPFS')
  }

  const allFiles = [
    'tokenizer.json',
    'tokenizer_config.json',
    contractFileName,
    'model_q4f16.onnx',
    ...shardNames,
  ]

  const sizes: number[] = []
  for (const name of allFiles) {
    const h = await dir.getFileHandle(name, { create: false })
    const f = await h.getFile()
    sizes.push(f.size)
  }
  const totalBytes = sizes.reduce((a, b) => a + b, 0)

  let bytesRead = 0
  let fileIndex = 0
  function emitProgress(currentFile: string) {
    onProgress?.({
      bytesRead,
      totalBytes,
      fileIndex,
      fileCount: allFiles.length,
      currentFile,
    })
  }

  async function tracked<T>(name: string, read: () => Promise<T>): Promise<T> {
    emitProgress(name)
    const v = await read()
    bytesRead += sizes[fileIndex]!
    fileIndex += 1
    emitProgress(name)
    return v
  }

  const tokenizerJson = await tracked('tokenizer.json', () => readTxt(dir, 'tokenizer.json'))
  const tokenizerConfigJson = await tracked('tokenizer_config.json', () =>
    readTxt(dir, 'tokenizer_config.json'),
  )
  const contractJson = await tracked(contractFileName, () =>
    readTxt(dir, contractFileName!),
  )
  const modelOnnx = await tracked('model_q4f16.onnx', () => readBuf(dir, 'model_q4f16.onnx'))
  const modelDataShards: Array<{ path: string; data: ArrayBuffer }> = []
  for (const sn of shardNames) {
    const buf = await tracked(sn, () => readBuf(dir, sn))
    modelDataShards.push({ path: sn, data: buf })
  }

  return {
    tokenizerJson,
    tokenizerConfigJson,
    contractJson,
    contractFileName,
    modelOnnx,
    modelDataShards,
  }
}
