import { describe, expect, it } from 'vitest'
import { normaliseLibraryLevel } from '@/messaging/logger'

// ONNX Runtime writes its own warnings to console.error, so tapping
// console.error verbatim reported them as extension errors. That made the
// inspector's error channel untrustworthy — "no errors" meant nothing.
describe('normaliseLibraryLevel', () => {
  it('downgrades ONNX Runtime warnings written to console.error', () => {
    const ortWarning =
      '[0;93m2026-08-14 09:16:51.827199 [W:onnxruntime:, session_state.cc:1327 VerifyEachNodeIsAssignedToAnEp] Some nodes were not assigned to the preferred execution providers'
    expect(normaliseLibraryLevel('error', ortWarning)).toBe('warn')
  })

  it('leaves genuine errors at error level', () => {
    expect(normaliseLibraryLevel('error', 'Missing output logits in model output')).toBe('error')
  })

  it('leaves ONNX Runtime errors at error level', () => {
    expect(normaliseLibraryLevel('error', '[E:onnxruntime:, inference_session.cc] failed')).toBe(
      'error',
    )
  })

  it('never upgrades a warning', () => {
    expect(normaliseLibraryLevel('warn', 'anything at all')).toBe('warn')
    expect(normaliseLibraryLevel('warn', '[W:onnxruntime:] noise')).toBe('warn')
  })

  it('passes through non-string arguments untouched', () => {
    expect(normaliseLibraryLevel('error', { some: 'object' })).toBe('error')
    expect(normaliseLibraryLevel('error', undefined)).toBe('error')
  })
})
