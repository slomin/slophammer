const OFFSCREEN_URL = 'offscreen.html'
const JUSTIFICATION = 'Run classifier inference for AI-text detection'

let creating: Promise<unknown> | null = null

export async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (existing.length > 0) return

  if (creating) {
    await creating
    return
  }

  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: JUSTIFICATION,
  })
  try {
    await creating
  } finally {
    creating = null
  }
}

export async function destroyOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  })
  if (existing.length === 0) return
  await chrome.offscreen.closeDocument()
}
