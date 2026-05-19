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
  const withLfs = new Map<string, TreeEntry>()
  for (const e of entries) {
    if (e.lfs?.oid) withLfs.set(e.path, e)
  }

  const latestFilename = pickLatestHostedZip([...withLfs.keys()])
  if (!latestFilename) return { hasUpdate: false, latest: null }

  const latestEntry = withLfs.get(latestFilename)!
  const latest: HostedLatest = {
    filename: latestFilename,
    lfsOid: latestEntry.lfs!.oid,
    size: latestEntry.lfs!.size,
    url: resolveHostedZipUrl(latestFilename),
  }

  const hasUpdate = !args.current || args.current.filename !== latest.filename || args.current.lfsOid !== latest.lfsOid
  return { hasUpdate, latest }
}
