import { HOSTED_MODEL, pickLatestHostedZip, resolveHostedZipUrl } from './hosted-model-config'

export interface HostedInstalledState {
  filename: string
  lfsOid: string
}

export interface HostedLatest {
  filename: string
  lfsOid: string
  url: string
  size: number
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  latest: HostedLatest | null
}

export interface CheckHostedForUpdateArgs {
  current: HostedInstalledState | null
  fetcher?: typeof fetch
}

interface TreeEntry {
  path: string
  size?: number
  lfs?: { oid: string; size: number }
}

function parseTreeEntries(body: unknown): TreeEntry[] {
  if (!Array.isArray(body)) return []
  return body.filter(
    (e): e is TreeEntry => typeof e === 'object' && e !== null && typeof (e as TreeEntry).path === 'string',
  )
}

export async function checkHostedForUpdate(args: CheckHostedForUpdateArgs): Promise<UpdateCheckResult> {
  const fetcher = args.fetcher ?? fetch
  const response = await fetcher(HOSTED_MODEL.treeApiUrl)
  if (!response.ok) {
    throw new Error(
      `Update check failed: HTTP ${response.status} ${response.statusText}`,
    )
  }

  const entries = parseTreeEntries(await response.json())
  const latestFilename = pickLatestHostedZip(entries.map((entry) => entry.path))
  if (!latestFilename) {
    throw new Error(`Pinned model ${HOSTED_MODEL.currentFilename} is missing from Hugging Face.`)
  }
  const latestEntry = entries.find((entry) => entry.path === latestFilename)!
  if (latestEntry.lfs?.oid !== HOSTED_MODEL.expectedSha256) {
    throw new Error('Pinned model checksum does not match the supported artifact.')
  }
  if (latestEntry.lfs.size !== HOSTED_MODEL.expectedSize) {
    throw new Error('Pinned model size does not match the supported artifact.')
  }
  const latest: HostedLatest = {
    filename: latestFilename,
    lfsOid: HOSTED_MODEL.expectedSha256,
    size: HOSTED_MODEL.expectedSize,
    url: resolveHostedZipUrl(latestFilename),
  }

  const hasUpdate = !args.current || args.current.filename !== latest.filename || args.current.lfsOid !== latest.lfsOid
  return { hasUpdate, latest }
}
