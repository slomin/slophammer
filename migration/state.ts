import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

export const V1_MIGRATION_STATE_KEY = 'slophammer-v1-migration'
export const V1_MIGRATION_INTENT_KEY = 'slophammer-v1-migration-intent'
export const V1_DATA_GENERATION_KEY = 'slophammer-data-generation'
export const V1_DATA_GENERATION = 1

export type MigrationPhase =
  | 'pending'
  | 'wiping'
  | 'downloading'
  | 'installing'
  | 'ready'
  | 'error'

export interface MigrationState {
  phase: MigrationPhase
  updatedAt: number
  progress?: number
  error?: string
  destructive?: boolean
  artifact?: typeof SUPPORTED_ARTIFACT.filename
}

export interface MigrationIntent {
  previousVersion: string
  targetVersion: string
  createdAt: number
}

export function migrationState(
  phase: MigrationPhase,
  patch: Pick<MigrationState, 'progress' | 'error' | 'destructive'> = {},
  now = Date.now(),
): MigrationState {
  return {
    phase,
    updatedAt: now,
    artifact: SUPPORTED_ARTIFACT.filename,
    ...patch,
  }
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1
  }
  return 0
}

export type InstallReason = 'install' | 'update' | 'chrome_update' | 'shared_module_update'

export function shouldPersistV1MigrationIntent(args: {
  reason: InstallReason
  previousVersion?: string
  currentVersion: string
}): boolean {
  return (
    args.reason === 'update' &&
    typeof args.previousVersion === 'string' &&
    compareSemver(args.previousVersion, '1.0.0') < 0 &&
    compareSemver(args.currentVersion, '1.0.0') >= 0
  )
}

export function migrationIntent(
  previousVersion: string,
  targetVersion: string,
  now = Date.now(),
): MigrationIntent {
  return { previousVersion, targetVersion, createdAt: now }
}

function isMigrationIntent(value: unknown): value is MigrationIntent {
  if (!value || typeof value !== 'object') return false
  const intent = value as Record<string, unknown>
  const semver = /^\d+\.\d+\.\d+(?:[-+].*)?$/
  return (
    typeof intent.previousVersion === 'string' &&
    semver.test(intent.previousVersion) &&
    typeof intent.targetVersion === 'string' &&
    semver.test(intent.targetVersion) &&
    typeof intent.createdAt === 'number' &&
    Number.isFinite(intent.createdAt)
  )
}

export function shouldRecoverV1Migration(args: {
  intent: unknown
  currentVersion: string
  completedGeneration?: number
}): boolean {
  if (args.completedGeneration === V1_DATA_GENERATION || !isMigrationIntent(args.intent)) {
    return false
  }
  return (
    compareSemver(args.intent.previousVersion, '1.0.0') < 0 &&
    compareSemver(args.intent.targetVersion, '1.0.0') >= 0 &&
    compareSemver(args.currentVersion, '1.0.0') >= 0
  )
}

export function shouldStartV1Migration(args: {
  reason: InstallReason
  previousVersion?: string
  currentVersion: string
  completedGeneration?: number
}): boolean {
  return (
    shouldPersistV1MigrationIntent(args) &&
    args.completedGeneration !== V1_DATA_GENERATION
  )
}

export function isMigrationBlocking(state: MigrationState | null | undefined): boolean {
  return Boolean(state && state.phase !== 'ready')
}

export function didMigrationBecomeReady(
  previous: MigrationState | null | undefined,
  current: MigrationState | null | undefined,
): boolean {
  return isMigrationBlocking(previous) && current?.phase === 'ready'
}

export function reconcileMigrationUiState(
  current: MigrationState | null,
  incoming: MigrationState | null,
): MigrationState | null {
  // storage.clear() deliberately removes the local mirror after the OPFS
  // journal is durable. Do not briefly unlock install controls before the
  // service worker recreates the `wiping` mirror.
  if (!incoming && isMigrationBlocking(current)) return current
  return incoming
}
