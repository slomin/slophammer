import { afterEach, describe, expect, it, vi } from 'vitest'
import { withHeartbeat } from '@/llm/inference-heartbeat'

afterEach(() => vi.useRealTimers())

describe('inference heartbeat', () => {
  it('keeps pulsing while migration readiness is unresolved and stops afterward', async () => {
    vi.useFakeTimers()
    let finishMigration!: () => void
    const migration = new Promise<void>((resolve) => { finishMigration = resolve })
    const pulse = vi.fn()

    const result = withHeartbeat(async () => {
      await migration
      return 'classified'
    }, pulse, 10_000)

    await vi.advanceTimersByTimeAsync(30_001)
    expect(pulse).toHaveBeenCalledTimes(3)
    finishMigration()
    await expect(result).resolves.toBe('classified')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(pulse).toHaveBeenCalledTimes(3)
  })
})
