export type RuntimeExecutionProvider = 'webgpu' | 'wasm'

export interface RuntimeDiagnostics {
  executionProvider: RuntimeExecutionProvider
  wasmThreads: number
  crossOriginIsolated: boolean
  fallbackReason?: string
}

export type WebGpuProbe<TAdapter = unknown> =
  | { available: true; adapter: TAdapter }
  | { available: false; reason: string }

export interface ProviderAttempt {
  provider: RuntimeExecutionProvider
  fallbackReason?: string
}

export interface ExecutionProviderDeps<T, TAdapter = unknown> {
  probeWebGpu: () => Promise<WebGpuProbe<TAdapter>>
  createWebGpu: (adapter: TAdapter) => Promise<T>
  createWasm: (fallbackReason: string) => Promise<T>
  onAttempt?: (attempt: ProviderAttempt) => void
}

export interface SelectedExecutionProvider<T> {
  value: T
  provider: RuntimeExecutionProvider
  fallbackReason?: string
}

export type RuntimeInitializationErrorCode =
  | 'unsupported-runtime'
  | 'allocation-failure'
  | 'corrupt-model'
  | 'provider-initialization'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function classifyFailure(message: string): RuntimeInitializationErrorCode {
  if (
    /out of memory|not enough memory|failed to allocate|allocation failed|array ?buffer allocation|memory access out of bounds/i.test(
      message,
    )
  ) {
    return 'allocation-failure'
  }
  if (
    /invalid protobuf|invalid model|corrupt|malformed|failed to load model|external data.*(?:missing|not found)|no such file/i.test(
      message,
    )
  ) {
    return 'corrupt-model'
  }
  if (
    /webassembly.*not supported|wasm.*not supported|simd.*not supported|no available backend|failed to (?:fetch|load).*(?:\.wasm|\.mjs)/i.test(
      message,
    )
  ) {
    return 'unsupported-runtime'
  }
  return 'provider-initialization'
}

function actionableMessage(code: RuntimeInitializationErrorCode): string {
  switch (code) {
    case 'allocation-failure':
      return 'SlopHammer could not reserve enough available memory for local analysis. Close other tabs or apps, then try again.'
    case 'corrupt-model':
      return 'The installed SlopHammer classifier appears corrupt. Open SlopHammer options and reinstall the verified model.'
    case 'unsupported-runtime':
      return 'This browser cannot run WebGPU or the local CPU/WASM fallback. Update Chrome and try again.'
    case 'provider-initialization':
      return 'Neither WebGPU nor local CPU/WASM inference could start. Restart Chrome and try again.'
  }
}

// Most specific first. Whichever attempt produced a recognisable cause is the
// one worth telling the user about, regardless of which provider it came from.
const CODE_PRECEDENCE: RuntimeInitializationErrorCode[] = [
  'allocation-failure',
  'corrupt-model',
  'unsupported-runtime',
  'provider-initialization',
]

function mostActionable(...messages: string[]): RuntimeInitializationErrorCode {
  const codes = messages.map(classifyFailure)
  for (const candidate of CODE_PRECEDENCE) {
    if (codes.includes(candidate)) return candidate
  }
  return 'provider-initialization'
}

/**
 * The installed model cannot be read, parsed, or reconciled with the session.
 * Provider-independent by definition, so the fallback is not attempted: it would
 * fail identically after a second full session build, and the dual-provider
 * message would tell the user to restart Chrome for something only a reinstall
 * fixes.
 */
export class ModelIntegrityError extends Error {
  readonly code = 'corrupt-model' as const
  readonly cause: string

  constructor(cause: string) {
    super(actionableMessage('corrupt-model'))
    this.name = 'ModelIntegrityError'
    this.cause = cause
  }

  diagnosticMessage(): string {
    return `Model integrity: ${this.cause}`
  }
}

export class RuntimeInitializationError extends Error {
  readonly code: RuntimeInitializationErrorCode
  readonly webGpuError: string
  readonly wasmError: string

  constructor(webGpuError: string, wasmError: string) {
    // The WASM error is the last thing that happened, but not necessarily the
    // thing that explains the failure: an out-of-memory on WebGPU followed by a
    // generic WASM error would otherwise advise restarting Chrome rather than
    // freeing memory.
    const code = mostActionable(wasmError, webGpuError)
    super(actionableMessage(code))
    this.name = 'RuntimeInitializationError'
    this.code = code
    this.webGpuError = webGpuError
    this.wasmError = wasmError
  }

  diagnosticMessage(): string {
    return `WebGPU: ${this.webGpuError}; CPU/WASM: ${this.wasmError}`
  }
}

export async function selectExecutionProvider<T, TAdapter = unknown>(
  deps: ExecutionProviderDeps<T, TAdapter>,
): Promise<SelectedExecutionProvider<T>> {
  let probe: WebGpuProbe<TAdapter>
  try {
    probe = await deps.probeWebGpu()
  } catch (error) {
    probe = { available: false, reason: errorMessage(error) }
  }

  let fallbackReason: string
  if (probe.available) {
    deps.onAttempt?.({ provider: 'webgpu' })
    try {
      return {
        value: await deps.createWebGpu(probe.adapter),
        provider: 'webgpu',
      }
    } catch (error) {
      // Nothing about a broken model gets better on the other provider.
      if (error instanceof ModelIntegrityError) throw error
      fallbackReason = errorMessage(error)
    }
  } else {
    fallbackReason = probe.reason
  }

  deps.onAttempt?.({ provider: 'wasm', fallbackReason })
  try {
    return {
      value: await deps.createWasm(fallbackReason),
      provider: 'wasm',
      fallbackReason,
    }
  } catch (error) {
    // Same guard as the WebGPU branch: on a CPU-only machine this is the *only*
    // attempt, so wrapping here would discard the type, its cause, and its
    // diagnostic for the entire fleet without a WebGPU adapter.
    if (error instanceof ModelIntegrityError) throw error
    throw new RuntimeInitializationError(fallbackReason, errorMessage(error))
  }
}
