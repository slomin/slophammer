/**
 * `onnxruntime-web/webgpu` boots through the asyncify WASM build even when the
 * only requested execution provider is WebGPU. The same build also contains
 * the CPU/WASM EP used by our explicit fallback. These filenames must match
 * the package entrypoint; the JSEP pair belongs to the general bundle.
 */
export const ORT_RUNTIME_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const
