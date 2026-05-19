export type InstallSource = 'hosted' | 'manual'

export interface HostedSentinelMeta {
  filename: string
  lfsOid: string
  url: string
}

export interface SentinelPayload {
  checkpointId: string
  installedAt: number
  contractFile: string
  source: InstallSource
  hosted?: HostedSentinelMeta
}

export function buildSentinel(args: {
  checkpointId: string
  contractFile: string
  installedAt?: number
  source?: InstallSource
  hosted?: HostedSentinelMeta
}): SentinelPayload {
  const source: InstallSource = args.source ?? (args.hosted ? 'hosted' : 'manual')
  const payload: SentinelPayload = {
    checkpointId: args.checkpointId,
    contractFile: args.contractFile,
    installedAt: args.installedAt ?? Date.now(),
    source,
  }
  if (args.hosted) payload.hosted = args.hosted
  return payload
}

function parseHosted(v: unknown): HostedSentinelMeta | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.filename !== 'string') return null
  if (typeof r.lfsOid !== 'string') return null
  if (typeof r.url !== 'string') return null
  return { filename: r.filename, lfsOid: r.lfsOid, url: r.url }
}

export function parseSentinel(raw: string): SentinelPayload | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.checkpointId !== 'string') return null
  if (typeof r.installedAt !== 'number') return null
  if (typeof r.contractFile !== 'string') return null
  const source: InstallSource = r.source === 'hosted' ? 'hosted' : 'manual'
  const payload: SentinelPayload = {
    checkpointId: r.checkpointId,
    installedAt: r.installedAt,
    contractFile: r.contractFile,
    source,
  }
  const hosted = parseHosted(r.hosted)
  if (hosted) payload.hosted = hosted
  return payload
}
