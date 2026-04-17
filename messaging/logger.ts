import type { LogLevel, LogMessage, LogSource } from './protocol'

const original = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function forward(source: LogSource, level: LogLevel, msg: string, data?: unknown) {
  const payload: LogMessage = { type: 'LOG', source, level, msg, data, ts: Date.now() }
  try {
    browser.runtime.sendMessage(payload).catch(() => {})
  } catch {
    // browser may be unavailable in tests; ignore.
  }
}

export function createLogger(source: LogSource) {
  return {
    debug: (msg: string, data?: unknown) => {
      original.debug(`[${source}]`, msg, data ?? '')
      forward(source, 'debug', msg, data)
    },
    info: (msg: string, data?: unknown) => {
      original.info(`[${source}]`, msg, data ?? '')
      forward(source, 'info', msg, data)
    },
    warn: (msg: string, data?: unknown) => {
      original.warn(`[${source}]`, msg, data ?? '')
      forward(source, 'warn', msg, data)
    },
    error: (msg: string, data?: unknown) => {
      original.error(`[${source}]`, msg, data ?? '')
      forward(source, 'error', msg, data)
    },
  }
}

function serializeReason(reason: unknown) {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack }
  return String(reason)
}

export function installErrorForwarding(source: LogSource) {
  globalThis.addEventListener('error', (e: Event) => {
    const err = e as ErrorEvent
    forward(source, 'error', `uncaught: ${err.message}`, {
      filename: err.filename,
      line: err.lineno,
      col: err.colno,
      stack: err.error instanceof Error ? err.error.stack : undefined,
    })
  })

  globalThis.addEventListener('unhandledrejection', (e: Event) => {
    const rej = e as PromiseRejectionEvent
    forward(source, 'error', 'unhandled rejection', serializeReason(rej.reason))
  })

  // Tap raw console.warn / console.error so library code also surfaces in the inspector.
  for (const level of ['warn', 'error'] as const) {
    const originalFn = original[level]
    console[level] = (...args: unknown[]) => {
      originalFn(...args)
      const [first, ...rest] = args
      forward(source, level, typeof first === 'string' ? first : String(first), rest.length ? rest : undefined)
    }
  }
}
