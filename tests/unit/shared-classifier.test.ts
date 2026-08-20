import { describe, expect, it, vi } from 'vitest'
import { createSharedClassifier } from '@/llm/shared-classifier'

describe('shared classifier', () => {
  it('creates one lazy classifier for concurrent callers and reuses it', async () => {
    const repository = { classify: vi.fn() }
    const factory = vi.fn(async () => repository)
    const shared = createSharedClassifier(factory)

    const [first, second, third] = await Promise.all([
      shared.get(),
      shared.get(),
      shared.get(),
    ])

    expect(first).toBe(repository)
    expect(second).toBe(repository)
    expect(third).toBe(repository)
    expect(await shared.get()).toBe(repository)
    expect(factory).toHaveBeenCalledOnce()
  })

  it('lets lifecycle orchestration replace the shared promise deliberately', async () => {
    const first = { classify: vi.fn() }
    const second = { classify: vi.fn() }
    const shared = createSharedClassifier(async () => first)

    expect(await shared.get()).toBe(first)
    const replacement = Promise.resolve(second)
    shared.replace(replacement)

    expect(shared.current()).toBe(replacement)
    expect(await shared.get()).toBe(second)
  })
})
