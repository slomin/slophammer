export interface ExternalDataFile {
  data: Uint8Array
  path: string
}

export function webGpuSessionOptions(externalData: ExternalDataFile[]) {
  return {
    executionProviders: ['webgpu'] as const,
    // ORT's WebGPU backend intentionally keeps shape/control operations on
    // its internal CPU path. Suppress that known provider-assignment warning
    // while preserving errors from session creation and inference.
    logSeverityLevel: 3 as const,
    externalData,
  }
}
