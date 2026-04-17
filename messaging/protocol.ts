export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'background' | 'popup' | 'inspector' | 'offscreen'

export interface LogMessage {
  type: 'LOG'
  source: LogSource
  level: LogLevel
  msg: string
  data?: unknown
  ts: number
}

export interface ScoreRequest {
  type: 'SCORE_REQUEST'
  text: string
}

export interface ScoreResponse {
  type: 'SCORE_RESPONSE'
  score: number
}

export type ExtensionMessage = LogMessage | ScoreRequest | ScoreResponse
