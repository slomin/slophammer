import { validateSupportedContract, type SlopHammerContract } from '@/llm/contract'
import { SUPPORTED_ARTIFACT, SUPPORTED_ARTIFACT_URL } from '@/llm/supported-artifact'
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

  if (args.hostedMeta && (
    args.hostedMeta.filename !== SUPPORTED_ARTIFACT.filename ||
    args.hostedMeta.lfsOid !== SUPPORTED_ARTIFACT.sha256 ||
    args.hostedMeta.url !== SUPPORTED_ARTIFACT_URL
  )) {
    throw new Error('Hosted model identity does not match the supported SlopHammer 350M artifact.')
  }

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
  validateSupportedContract(contract)

  const checkpointId = contract.version ?? contract.base_model ?? contractFile
  const sentinel = buildSentinel({ checkpointId, contractFile, hosted: args.hostedMeta })
  await marks.setInstalled(checkpointId)
  await marks.persistStorage()
  // The OPFS sentinel is the activation boundary. Write it only after every
  // model file, exact contract check, storage marker and persistence request
  // has succeeded, so an interruption can never advertise a partial model.
  await opfs.writeSentinel(JSON.stringify(sentinel))

  return contract
}
