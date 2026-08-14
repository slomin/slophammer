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

// ONNX Runtime writes its own warnings to console.error, so forwarding the
// console level verbatim reported library warnings as extension errors and made
// the inspector's error channel untrustworthy. Only warnings the library itself
// tags as warnings are downgraded; genuine errors are left alone.
const LIBRARY_WARNING_PATTERNS = [/\[W:onnxruntime/]

export function normaliseLibraryLevel(level: LogLevel, first: unknown): LogLevel {
  if (level !== 'error') return level
  if (typeof first !== 'string') return level
  return LIBRARY_WARNING_PATTERNS.some((re) => re.test(first)) ? 'warn' : level
}

function serializeReason(reason: unknown) {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack }
  return String(reason)
}

const FORWARDING_INSTALLED = Symbol.for('slophammer.errorForwardingInstalled')

export function installErrorForwarding(source: LogSource) {
  // On-demand injection can evaluate the content script twice in the same
  // isolated world. Without this guard the second instance captures the first
  // instance's tap as `original`, so every warning is forwarded twice and the
  // chain nests with each further injection.
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[FORWARDING_INSTALLED]) return
  g[FORWARDING_INSTALLED] = true

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
    console[level] = (...args: unknown[]) => {
      const [first, ...rest] = args
      // Emit at the corrected level too, so a library warning shows up as a
      // warning in DevTools rather than a red error the developer has to
      // re-triage on every run.
      const effective = normaliseLibraryLevel(level, first)
      original[effective](...args)
      forward(
        source,
        effective,
        typeof first === 'string' ? first : String(first),
        rest.length ? rest : undefined,
      )
    }
  }
}
