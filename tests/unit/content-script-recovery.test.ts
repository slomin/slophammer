import { describe, expect, it, vi } from 'vitest'
import { ensureTabContentScript } from '@/background/content-script-recovery'

describe('ensureTabContentScript', () => {
  it('uses an already-live listener without injecting again', async () => {
    const ping = vi.fn().mockResolvedValue({ alive: true })
    const inject = vi.fn()

    await expect(ensureTabContentScript({ ping, inject }, 7)).resolves.toBe(true)
    expect(inject).not.toHaveBeenCalled()
  })

  it('injects into a stale tab and verifies the new listener', async () => {
    const ping = vi.fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ alive: true })
    const inject = vi.fn().mockResolvedValue(undefined)

    await expect(ensureTabContentScript({ ping, inject }, 8)).resolves.toBe(true)
    expect(inject).toHaveBeenCalledWith(8)
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('does not report success when script execution produced no listener', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('Receiving end does not exist'))
    const inject = vi.fn().mockResolvedValue(undefined)

    await expect(ensureTabContentScript({ ping, inject }, 9)).resolves.toBe(false)
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('rejects a resolved ping that did not come from SlopHammer', async () => {
    const ping = vi.fn().mockResolvedValue(undefined)
    const inject = vi.fn().mockResolvedValue(undefined)

    await expect(ensureTabContentScript({ ping, inject }, 10)).resolves.toBe(false)
    expect(inject).toHaveBeenCalledWith(10)
  })
})
