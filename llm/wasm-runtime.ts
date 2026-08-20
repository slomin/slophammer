export interface WasmThreadEnvironment {
  crossOriginIsolated: boolean
  hardwareConcurrency?: number
}

/**
 * Match ONNX Runtime's conservative browser default when shared memory is
 * usable: half the logical cores, capped at four. Keeping one core free on a
 * two-core machine matters more than a marginal throughput gain, especially
 * on the older Windows and ChromeOS devices this fallback is for.
 */
export function chooseWasmThreadCount(environment: WasmThreadEnvironment): number {
  if (!environment.crossOriginIsolated) return 1
  const logicalCores = Number.isFinite(environment.hardwareConcurrency)
    ? Math.max(1, Math.floor(environment.hardwareConcurrency ?? 1))
    : 1
  return Math.min(4, Math.max(1, Math.ceil(logicalCores / 2)))
}
