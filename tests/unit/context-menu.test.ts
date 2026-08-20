import { describe, expect, it } from 'vitest'
import {
  buildStartedMessage,
  countWords,
  handleMenuClick,
  isSelectionLongEnough,
  MENU_ITEM_ID,
  MIN_SELECTION_WORDS,
  type ContextMenuDeps,
} from '@/background/context-menu'

describe('countWords', () => {
  it('splits on whitespace', () => {
    expect(countWords('the quick brown fox')).toBe(4)
  })

  it('collapses repeated whitespace', () => {
    expect(countWords('  a   b  c ')).toBe(3)
  })

  it('treats newlines and tabs as whitespace', () => {
    expect(countWords('line one\ntwo\tthree')).toBe(4)
  })

  it('returns 0 for empty or whitespace-only', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('\n\t ')).toBe(0)
  })

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1)
    expect(countWords('  hello  ')).toBe(1)
  })
})

describe('isSelectionLongEnough', () => {
  const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

  it('rejects 39 words regardless of character length', () => {
    expect(isSelectionLongEnough(words(MIN_SELECTION_WORDS - 1))).toBe(false)
    expect(isSelectionLongEnough('one'.repeat(1_000))).toBe(false)
  })

  it('accepts 40 words with Unicode and repeated whitespace', () => {
    expect(isSelectionLongEnough(words(MIN_SELECTION_WORDS))).toBe(true)
    expect(isSelectionLongEnough(words(MIN_SELECTION_WORDS).replaceAll(' ', '\n\t'))).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isSelectionLongEnough(`   ${words(MIN_SELECTION_WORDS)}   `)).toBe(true)
  })
})

describe('buildStartedMessage', () => {
  it('truncates preview to 200 chars', () => {
    const long = 'a'.repeat(500)
    const msg = buildStartedMessage({ requestId: 'r1', text: long })
    expect(msg.preview.length).toBe(200)
    expect(msg.charCount).toBe(500)
  })

  it('keeps the full text when shorter than 200', () => {
    const short = 'hello world'
    const msg = buildStartedMessage({ requestId: 'r1', text: short })
    expect(msg.preview).toBe(short)
    expect(msg.charCount).toBe(11)
  })

  it('passes requestId through', () => {
    const msg = buildStartedMessage({ requestId: 'abc-123', text: 'x'.repeat(80) })
    expect(msg.requestId).toBe('abc-123')
    expect(msg.type).toBe('classify:started')
  })

  it('counts words via countWords', () => {
    const msg = buildStartedMessage({ requestId: 'r1', text: 'one two three four' })
    expect(msg.wordCount).toBe(4)
  })
})

describe('handleMenuClick', () => {
  function makeDeps(overrides: Partial<ContextMenuDeps> = {}) {
    const calls = {
      tabMessages: [] as unknown[],
      runtimeMessages: [] as unknown[],
      unreachable: [] as number[],
      offscreenEnsured: 0,
    }
    const deps: ContextMenuDeps = {
      logger: { info: () => {}, warn: () => {} },
      sendToTab: (_tabId, msg) => calls.tabMessages.push(msg),
      sendToRuntime: (msg) => calls.runtimeMessages.push(msg),
      ensureOffscreen: async () => {
        calls.offscreenEnsured += 1
      },
      newRequestId: () => 'req-1',
      ensureContentScript: async () => true,
      onUnreachable: (tabId) => calls.unreachable.push(tabId),
      ...overrides,
    }
    return { deps, calls }
  }

  const longText = Array.from({ length: MIN_SELECTION_WORDS }, (_, i) => `word${i}`).join(' ')

  it('ignores clicks on other menu items', async () => {
    const { deps, calls } = makeDeps()
    await handleMenuClick(deps, { menuItemId: 'something-else', selectionText: longText, tabId: 1 })
    expect(calls.tabMessages).toHaveLength(0)
    expect(calls.runtimeMessages).toHaveLength(0)
  })

  it('ignores clicks with no tab id', async () => {
    const { deps, calls } = makeDeps()
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: longText })
    expect(calls.runtimeMessages).toHaveLength(0)
  })

  // The silent-failure case: restricted pages, and any tab already open when
  // the extension updated.
  it('reports unreachable tabs instead of messaging into the void', async () => {
    const { deps, calls } = makeDeps({ ensureContentScript: async () => false })
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: longText, tabId: 7 })
    expect(calls.unreachable).toEqual([7])
    expect(calls.tabMessages).toHaveLength(0)
    expect(calls.runtimeMessages).toHaveLength(0)
  })

  it('checks reachability before sending, so the toast can actually be seen', async () => {
    const order: string[] = []
    const { deps } = makeDeps({
      ensureContentScript: async () => {
        order.push('ensure')
        return true
      },
      sendToTab: () => order.push('send'),
    })
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: 'too short', tabId: 3 })
    expect(order).toEqual(['ensure', 'send'])
  })

  // Tabs that were already open when the extension was installed or reloaded
  // have no content script yet. Short selections still need the content script
  // so the promised "too short" card is visible instead of becoming a no-op.
  it('injects for a short selection so stale tabs can show the rejection card', async () => {
    const calls: Array<{ inject: boolean }> = []
    const { deps } = makeDeps({
      ensureContentScript: async (_tabId, options) => {
        calls.push(options)
        return true
      },
    })
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: 'short', tabId: 3 })
    expect(calls).toEqual([{ inject: true }])
  })

  it('injects when there is real work to do', async () => {
    const calls: Array<{ inject: boolean }> = []
    const { deps } = makeDeps({
      ensureContentScript: async (_tabId, options) => {
        calls.push(options)
        return true
      },
    })
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: longText, tabId: 3 })
    expect(calls).toEqual([{ inject: true }])
  })

  it('sends selection:too-short without classifying', async () => {
    const { deps, calls } = makeDeps()
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: 'short', tabId: 3 })
    expect(calls.tabMessages).toEqual([{ type: 'selection:too-short', wordCount: 1, minWords: 40 }])
    expect(calls.runtimeMessages).toHaveLength(0)
    expect(calls.offscreenEnsured).toBe(0)
  })

  it('logs a short selection as expected information, not a warning', async () => {
    const levels: string[] = []
    const { deps } = makeDeps({
      logger: {
        info: () => levels.push('info'),
        warn: () => levels.push('warn'),
      },
    })

    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: 'short', tabId: 3 })

    expect(levels).toEqual(['info'])
  })

  it('starts the card, ensures the offscreen document, then dispatches the run', async () => {
    const { deps, calls } = makeDeps()
    await handleMenuClick(deps, { menuItemId: MENU_ITEM_ID, selectionText: longText, tabId: 42 })
    expect((calls.tabMessages[0] as { type: string }).type).toBe('classify:started')
    expect(calls.offscreenEnsured).toBe(1)
    expect(calls.runtimeMessages).toEqual([
      { type: 'classify:run', requestId: 'req-1', tabId: 42, text: longText },
    ])
  })

  it('trims the selection before measuring it', async () => {
    const { deps, calls } = makeDeps()
    await handleMenuClick(deps, {
      menuItemId: MENU_ITEM_ID,
      selectionText: `   ${longText}   `,
      tabId: 9,
    })
    expect((calls.runtimeMessages[0] as { text: string }).text).toBe(longText)
  })
})
