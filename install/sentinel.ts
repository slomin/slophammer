export interface SentinelPayload {
  checkpointId: string
  installedAt: number
  contractFile: string
}

export function buildSentinel(args: {
  checkpointId: string
  contractFile: string
  installedAt?: number
}): SentinelPayload {
  return {
    checkpointId: args.checkpointId,
    contractFile: args.contractFile,
    installedAt: args.installedAt ?? Date.now(),
  }
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
  return { checkpointId: r.checkpointId, installedAt: r.installedAt, contractFile: r.contractFile }
}
