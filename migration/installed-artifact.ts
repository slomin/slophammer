import { parseSentinel } from '@/install/sentinel'
import {
  CONTRACT_FILENAMES,
  CORE_MODEL_FILES,
  validateSupportedContract,
} from '@/llm/contract'
import { MODEL_ROOT_DIR, MODEL_SUBDIR, SENTINEL_NAME } from '@/llm/opfs-model-reader'
import { SUPPORTED_ARTIFACT, SUPPORTED_ARTIFACT_URL } from '@/llm/supported-artifact'

export interface InstalledArtifactReader {
  readSentinel(): Promise<string>
  readModelText(filename: string): Promise<string>
  modelFileExists(filename: string): Promise<boolean>
}

const REQUIRED_MODEL_FILES = [
  ...CORE_MODEL_FILES,
  'model_q4f16.onnx.data_0',
] as const

export async function hasSupportedInstalledArtifact(
  reader: InstalledArtifactReader,
): Promise<boolean> {
  try {
    const sentinel = parseSentinel(await reader.readSentinel())
    if (!sentinel || sentinel.checkpointId !== SUPPORTED_ARTIFACT.contractVersion) return false
    if (!CONTRACT_FILENAMES.includes(sentinel.contractFile as typeof CONTRACT_FILENAMES[number])) {
      return false
    }
    if (sentinel.source === 'hosted') {
      if (
        sentinel.hosted?.filename !== SUPPORTED_ARTIFACT.filename ||
        sentinel.hosted.lfsOid !== SUPPORTED_ARTIFACT.sha256 ||
        sentinel.hosted.url !== SUPPORTED_ARTIFACT_URL
      ) {
        return false
      }
    }
    for (const filename of [...REQUIRED_MODEL_FILES, sentinel.contractFile]) {
      if (!(await reader.modelFileExists(filename))) return false
    }
    validateSupportedContract(JSON.parse(await reader.readModelText(sentinel.contractFile)))
    return true
  } catch {
    return false
  }
}

export function browserInstalledArtifactReader(): InstalledArtifactReader {
  const parent = async () => {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle(MODEL_ROOT_DIR, { create: false })
  }
  const model = async () => (await parent()).getDirectoryHandle(MODEL_SUBDIR, { create: false })
  return {
    async readSentinel() {
      const handle = await (await parent()).getFileHandle(SENTINEL_NAME, { create: false })
      return (await handle.getFile()).text()
    },
    async readModelText(filename) {
      const handle = await (await model()).getFileHandle(filename, { create: false })
      return (await handle.getFile()).text()
    },
    async modelFileExists(filename) {
      try {
        await (await model()).getFileHandle(filename, { create: false })
        return true
      } catch {
        return false
      }
    },
  }
}
