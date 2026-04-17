import { formatPct } from '@/llm/classify-result'
import type { RawProbs } from '@/llm/classify-result'
import type { CardElements } from './card-dom'
import type { CardState } from './state'

function setVisible(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hide', !visible)
}

function setText(el: HTMLElement, text: string): void {
  el.textContent = text
}

export function renderState(card: CardElements, state: CardState): void {
  const { refs } = card
  refs.root.dataset.state = state.kind

  switch (state.kind) {
    case 'idle':
      setVisible(refs.preview, false)
      setVisible(refs.wordCount, false)
      setVisible(refs.spinner, false)
      setVisible(refs.primaryPct, false)
      setVisible(refs.primaryLabel, false)
      setVisible(refs.errorMessage, false)
      setVisible(refs.dismissButton, false)
      setRawBreakdown(card, null)
      return

    case 'loading':
      setText(refs.preview, state.preview)
      setText(refs.wordCount, `${state.wordCount} words`)
      setVisible(refs.preview, true)
      setVisible(refs.wordCount, true)
      setVisible(refs.spinner, true)
      setVisible(refs.primaryPct, false)
      setVisible(refs.primaryLabel, false)
      setVisible(refs.errorMessage, false)
      setVisible(refs.dismissButton, false)
      setBarPcts(card, 0, 0, 0)
      setRawBreakdown(card, null)
      return

    case 'ready': {
      const { result } = state
      setText(refs.preview, state.preview)
      setText(refs.wordCount, `${state.wordCount} words`)
      setVisible(refs.preview, true)
      setVisible(refs.wordCount, true)
      setVisible(refs.spinner, false)

      setText(refs.primaryPct, formatPct(result.primaryPct))
      setText(refs.primaryLabel, result.primaryLabel)
      setVisible(refs.primaryPct, true)
      setVisible(refs.primaryLabel, true)

      setBarPcts(card, result.humanPct, result.mixedPct, result.aiPct)
      setRawBreakdown(card, result.rawPct)

      setVisible(refs.errorMessage, false)
      setVisible(refs.dismissButton, true)
      return
    }

    case 'error':
      setText(refs.preview, state.preview)
      setText(refs.wordCount, `${state.wordCount} words`)
      setText(refs.errorMessage, state.error)
      setVisible(refs.preview, true)
      setVisible(refs.wordCount, true)
      setVisible(refs.spinner, false)
      setVisible(refs.primaryPct, false)
      setVisible(refs.primaryLabel, false)
      setVisible(refs.errorMessage, true)
      setVisible(refs.dismissButton, true)
      setBarPcts(card, 0, 0, 0)
      setRawBreakdown(card, null)
      return
  }
}

function setBarPcts(card: CardElements, humanPct: number, mixedPct: number, aiPct: number): void {
  card.refs.barHuman.dataset.pct = String(Math.round(humanPct))
  card.refs.barMixed.dataset.pct = String(Math.round(mixedPct))
  card.refs.barAi.dataset.pct = String(Math.round(aiPct))
}

function setRawBreakdown(card: CardElements, rawPct: RawProbs | null): void {
  const { raw } = card.refs
  if (!rawPct) {
    raw.human.textContent = '—'
    raw.lightly.textContent = '—'
    raw.moderately.textContent = '—'
    raw.heavily.textContent = '—'
    return
  }
  raw.human.textContent = formatPct(rawPct[0]) + '%'
  raw.lightly.textContent = formatPct(rawPct[1]) + '%'
  raw.moderately.textContent = formatPct(rawPct[2]) + '%'
  raw.heavily.textContent = formatPct(rawPct[3]) + '%'
}
