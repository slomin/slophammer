import { SUPPORTED_ARTIFACT, SUPPORTED_ARTIFACT_URL } from '@/llm/supported-artifact'

export interface HostedModelConfig {
  repoId: string
  treeApiUrl: string
  currentFilename: string
  expectedSize: number
  expectedSha256: string
}

export const HOSTED_MODEL: HostedModelConfig = {
  repoId: SUPPORTED_ARTIFACT.repoId,
  treeApiUrl: SUPPORTED_ARTIFACT.treeApiUrl,
  currentFilename: SUPPORTED_ARTIFACT.filename,
  expectedSize: SUPPORTED_ARTIFACT.size,
  expectedSha256: SUPPORTED_ARTIFACT.sha256,
}

export function resolveHostedZipUrl(filename: string): string {
  return filename === SUPPORTED_ARTIFACT.filename ? SUPPORTED_ARTIFACT_URL : ''
}

export function pickLatestHostedZip(filenames: readonly string[]): string | null {
  return filenames.includes(SUPPORTED_ARTIFACT.filename) ? SUPPORTED_ARTIFACT.filename : null
}
