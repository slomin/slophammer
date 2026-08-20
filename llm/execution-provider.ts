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

function classifyWasmFailure(message: string): RuntimeInitializationErrorCode {
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

export class RuntimeInitializationError extends Error {
  readonly code: RuntimeInitializationErrorCode
  readonly webGpuError: string
  readonly wasmError: string

  constructor(webGpuError: string, wasmError: string) {
    const code = classifyWasmFailure(wasmError)
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
    throw new RuntimeInitializationError(fallbackReason, errorMessage(error))
  }
}
