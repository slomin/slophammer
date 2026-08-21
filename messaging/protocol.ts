import type { ClassifyResult } from '@/llm/classify-result'
import type { RuntimeExecutionProvider } from '@/llm/execution-provider'
import type { MigrationState } from '@/migration/state'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'background' | 'content' | 'offscreen' | 'options' | 'inspector'

export interface LogMessage {
  type: 'LOG'
  source: LogSource
  level: LogLevel
  msg: string
  data?: unknown
  ts: number
}

/** Liveness probe: a content script answers, an absent or orphaned one does not. */
export interface PingMessage {
  type: 'ping'
}

export interface SelectionTooShortMessage {
  type: 'selection:too-short'
  wordCount: number
  minWords: number
}

export interface ClassifyStartedMessage {
  type: 'classify:started'
  requestId: string
  preview: string
  wordCount: number
  charCount: number
}

export interface ClassifyRunMessage {
  type: 'classify:run'
  requestId: string
  tabId: number
  text: string
}

export interface ClassifyResultMessage {
  type: 'classify:result'
  requestId: string
  tabId: number
  result: ClassifyResult
}

export interface ClassifyErrorMessage {
  type: 'classify:error'
  requestId: string
  tabId: number
  error: string
}

export interface ModelLoadMessage {
  type: 'model:load'
}

export type ModelStatus = 'not-installed' | 'loading' | 'ready' | 'error'

export interface ModelStatusMessage {
  type: 'model:status'
  status: ModelStatus
  progress?: number
  error?: string
  provider?: RuntimeExecutionProvider
}

export interface ModelInstalledMessage {
  type: 'model:installed'
}

export interface MigrationStartMessage {
  type: 'migration:start' | 'migration:resume'
}

export interface MigrationRequestResumeMessage {
  type: 'migration:request-resume'
}

export interface MigrationStorageClearRequestMessage {
  type: 'migration:storage-clear-request'
}

export type MigrationStorageOperation =
  | 'model-marker'
  | 'existing-complete'
  | 'restore-defaults'

export interface MigrationStorageWriteRequestMessage {
  type: 'migration:storage-write-request'
  operation: MigrationStorageOperation
  checkpointId?: string
}

export interface MigrationStatusMessage {
  type: 'migration:status'
  state: MigrationState
}

export type ExtensionMessage =
  | LogMessage
  | PingMessage
  | SelectionTooShortMessage
  | ClassifyStartedMessage
  | ClassifyRunMessage
  | ClassifyResultMessage
  | ClassifyErrorMessage
  | ModelLoadMessage
  | ModelStatusMessage
  | ModelInstalledMessage
  | MigrationStartMessage
  | MigrationRequestResumeMessage
  | MigrationStorageClearRequestMessage
  | MigrationStorageWriteRequestMessage
  | MigrationStatusMessage

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function hasType<T extends string>(m: unknown, type: T): m is { type: T } {
  return isRecord(m) && m.type === type
}

export function isLogMessage(m: unknown): m is LogMessage {
  return hasType(m, 'LOG')
}

export function isPing(m: unknown): m is PingMessage {
  return hasType(m, 'ping')
}

export function isSelectionTooShort(m: unknown): m is SelectionTooShortMessage {
  return hasType(m, 'selection:too-short')
}

export function isClassifyRun(m: unknown): m is ClassifyRunMessage {
  return hasType(m, 'classify:run')
}

export function isClassifyStarted(m: unknown): m is ClassifyStartedMessage {
  return hasType(m, 'classify:started')
}

export function isClassifyResult(m: unknown): m is ClassifyResultMessage {
  if (!hasType(m, 'classify:result')) return false
  const value = m as Record<string, unknown>
  const result = value.result
  if (!isRecord(result)) return false
  const verdict = result.verdict
  return (
    typeof value.requestId === 'string' &&
    typeof value.tabId === 'number' &&
    Array.isArray(result.probs) && result.probs.length === 4 && result.probs.every((v) => typeof v === 'number') &&
    Array.isArray(result.rawPct) && result.rawPct.length === 4 && result.rawPct.every((v) => typeof v === 'number') &&
    Array.isArray(result.bucketLabels) && result.bucketLabels.length === 4 && result.bucketLabels.every((v) => typeof v === 'string') &&
    typeof result.extLlr === 'number' &&
    typeof result.threshold === 'number' &&
    (verdict === 'flagged' || verdict === 'near-threshold' || verdict === 'not-flagged')
  )
}

export function isClassifyError(m: unknown): m is ClassifyErrorMessage {
  return hasType(m, 'classify:error')
}

export function isModelLoad(m: unknown): m is ModelLoadMessage {
  return hasType(m, 'model:load')
}

export function isModelStatus(m: unknown): m is ModelStatusMessage {
  return hasType(m, 'model:status')
}

export function isModelInstalled(m: unknown): m is ModelInstalledMessage {
  return hasType(m, 'model:installed')
}
