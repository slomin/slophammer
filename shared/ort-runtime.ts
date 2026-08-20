/**
 * `onnxruntime-web/webgpu` boots through the asyncify WASM build even when the
 * only requested execution provider is WebGPU. These filenames must match
 * the package entrypoint; the JSEP pair belongs to `onnxruntime-web`.
 */
export const ORT_WEBGPU_RUNTIME_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const
