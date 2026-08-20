import type { HostedInstalledState } from './hf-update-checker'
import type { SentinelPayload } from './sentinel'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

export async function resolveInstalledHostedState(args: {
  sentinel: SentinelPayload | null
  hasSupportedInstall: () => Promise<boolean>
}): Promise<HostedInstalledState | null> {
  // A manually selected ZIP has no Hugging Face metadata. Validate the actual
  // installed files and audited contract before mapping it to the pinned
  // identity, so "Check for updates" does not offer the same artifact again.
  if (await args.hasSupportedInstall()) {
    return {
      filename: SUPPORTED_ARTIFACT.filename,
      lfsOid: SUPPORTED_ARTIFACT.sha256,
    }
  }

  const hosted = args.sentinel?.hosted
  return hosted ? { filename: hosted.filename, lfsOid: hosted.lfsOid } : null
}
