import { validateContract, type SlopHammerContract } from '@/llm/contract'
import { assertRequiredFiles, isKnownModelFile } from './file-recognition'
import { buildSentinel, type HostedSentinelMeta } from './sentinel'

export interface ZipEntry {
  name: string
  readAll(): Promise<Uint8Array>
}

export interface ZipReaderLike {
  entries(): AsyncIterable<ZipEntry>
  readBytes(): number
  totalBytes(): number
}

export interface OpfsAdapterLike {
  resetModelDir(): Promise<void>
  writeFile(name: string, data: Uint8Array): Promise<void>
  readTextFile(name: string): Promise<string>
  writeSentinel(text: string): Promise<void>
}

export interface StorageMarkerLike {
  setInstalled(checkpointId: string): Promise<void>
  persistStorage(): Promise<void>
}

export interface InstallProgress {
  readBytes: number
  totalBytes: number
  fraction: number
  currentFile?: string
  completedFiles: number
  totalFiles: number
}

export interface RunInstallArgs {
  reader: ZipReaderLike
  opfs: OpfsAdapterLike
  marks: StorageMarkerLike
  onProgress: (p: InstallProgress) => void
  hostedMeta?: HostedSentinelMeta
}

export async function runInstall(args: RunInstallArgs): Promise<SlopHammerContract> {
  const { reader, opfs, marks, onProgress } = args

  await opfs.resetModelDir()

  const seen = new Set<string>()
  let completed = 0

  for await (const e of reader.entries()) {
    if (!isKnownModelFile(e.name)) continue
    const bytes = await e.readAll()
    await opfs.writeFile(e.name, bytes)
    seen.add(e.name)
    completed += 1
    const total = Math.max(1, reader.totalBytes())
    const readBytes = reader.readBytes()
    onProgress({
      readBytes,
      totalBytes: total,
      fraction: Math.min(1, readBytes / total),
      currentFile: e.name,
      completedFiles: completed,
      // The zip is streamed, so the entry count is not knowable up front.
      // Reporting seen.size made the UI always read "n of n".
      totalFiles: 0,
    })
  }

  const contractFile = assertRequiredFiles(seen)

  const contractText = await opfs.readTextFile(contractFile)
  const contract: unknown = JSON.parse(contractText)
  validateContract(contract)

  const checkpointId = contract.version ?? contract.base_model ?? contractFile
  const sentinel = buildSentinel({ checkpointId, contractFile, hosted: args.hostedMeta })
  await opfs.writeSentinel(JSON.stringify(sentinel))

  await marks.setInstalled(checkpointId)
  await marks.persistStorage()

  return contract
}
