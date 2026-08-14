export interface HostedZipVersion {
  major: number
  minor: number
  patch: number
}

export interface HostedModelConfig {
  repoId: string
  treeApiUrl: string
  currentFilename: string
}

export const HOSTED_MODEL: HostedModelConfig = {
  repoId: 'Slomin/slop_hammer_0_8_b',
  treeApiUrl: 'https://huggingface.co/api/models/Slomin/slop_hammer_0_8_b/tree/main',
  currentFilename: 'slop_hammer_0_8b_v0_1.zip',
}

// Releases use both two- and three-part names (v0_1, v0_4_600), so a
// two-part pattern silently reported "no update available".
const VERSIONED_ZIP = /^slop_hammer_0_8b_v(\d+)_(\d+)(?:_(\d+))?\.zip$/

export function resolveHostedZipUrl(filename: string): string {
  return `https://huggingface.co/${HOSTED_MODEL.repoId}/resolve/main/${filename}`
}

export function parseHostedZipVersion(filename: string): HostedZipVersion | null {
  const m = VERSIONED_ZIP.exec(filename)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: m[3] === undefined ? 0 : Number(m[3]) }
}

export function compareHostedVersions(a: HostedZipVersion, b: HostedZipVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

export function pickLatestHostedZip(filenames: readonly string[]): string | null {
  let best: { name: string; v: HostedZipVersion } | null = null
  for (const name of filenames) {
    const v = parseHostedZipVersion(name)
    if (!v) continue
    if (!best || compareHostedVersions(v, best.v) > 0) best = { name, v }
  }
  return best?.name ?? null
}
