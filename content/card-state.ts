import type { ClassifyResult, RawProbs } from '@/llm/classify-result'
import type { CardElements } from './card-dom'
import type { CardState } from './state'
import { computeBinary, verdictDescriptor } from './verdict'

function show(el: HTMLElement): void {
  el.classList.remove('hide')
}

function hide(el: HTMLElement): void {
  el.classList.add('hide')
}

function setPct(el: HTMLElement, pct: number): void {
  const rounded = Math.round(pct)
  el.dataset.pct = String(rounded)
  el.style.width = `${rounded}%`
}

function argmax(rawPct: RawProbs): 0 | 1 | 2 | 3 {
  let best: 0 | 1 | 2 | 3 = 0
  for (let i = 1 as 1 | 2 | 3; i < 4; i++) {
    if (rawPct[i]! > rawPct[best]!) best = i
  }
  return best
}

export function renderState(card: CardElements, state: CardState): void {
  const { refs } = card
  refs.root.dataset.state = state.kind

  switch (state.kind) {
    case 'idle':
      // Host stays in DOM but card-root display:none keeps it invisible.
      hide(refs.loadingRow)
      hide(refs.verdictBox)
      hide(refs.modeRow)
      hide(refs.advanced)
      hide(refs.errorBox)
      hide(refs.actionsRow)
      return

    case 'loading':
      refs.preview.textContent = state.preview
      refs.wordCount.textContent = `${state.wordCount} w`
      show(refs.loadingRow)
      hide(refs.verdictBox)
      hide(refs.modeRow)
      hide(refs.advanced)
      hide(refs.errorBox)
      hide(refs.actionsRow)
      return

    case 'ready': {
      refs.preview.textContent = state.preview
      refs.wordCount.textContent = `${state.wordCount} w`
      renderReady(card, state.result)
      hide(refs.loadingRow)
      hide(refs.errorBox)
      show(refs.verdictBox)
      show(refs.modeRow)
      // advanced drawer visibility is gated by .hide (structural) and data-mode (expansion)
      show(refs.advanced)
      show(refs.actionsRow)
      refs.actionsRow.classList.remove('single')
      show(refs.btnCopy)
      show(refs.btnShare)
      hide(refs.dismissButton)
      return
    }

    case 'error':
      refs.preview.textContent = state.preview
      refs.wordCount.textContent = `${state.wordCount} w`
      refs.errorMessage.textContent = state.error
      show(refs.errorBox)
      show(refs.actionsRow)
      refs.actionsRow.classList.add('single')
      hide(refs.btnCopy)
      hide(refs.btnShare)
      show(refs.dismissButton)
      hide(refs.loadingRow)
      hide(refs.verdictBox)
      hide(refs.modeRow)
      hide(refs.advanced)
      return
  }
}

function renderReady(card: CardElements, result: ClassifyResult): void {
  const { refs } = card
  const binary = computeBinary(result.rawPct)
  // Round once and reuse, so the chip, label, hero %, bar widths and legend
  // all agree about which side of the 65 / 85 thresholds we're on and never
  // add up to 99% or 101% at half-percent boundaries.
  const winPctRounded = Math.round(binary.winPct)
  const loserRounded = 100 - winPctRounded
  const descriptor = verdictDescriptor(winPctRounded, binary.winner)

  refs.verdictBox.dataset.verdict = descriptor.side
  refs.verdictLabel.textContent = descriptor.label
  refs.verdictConfidence.textContent = descriptor.confidenceText
  refs.verdictBig.textContent = String(winPctRounded)
  refs.verdictText.textContent = descriptor.sentence

  const humanRounded = binary.winner === 'human' ? winPctRounded : loserRounded
  const aiRounded = binary.winner === 'ai' ? winPctRounded : loserRounded
  setPct(refs.binaryBarHuman, humanRounded)
  setPct(refs.binaryBarAi, aiRounded)
  refs.binaryLegendHuman.textContent = `HUMAN ${humanRounded}%`
  refs.binaryLegendAi.textContent = `${aiRounded}% AI`

  const winIdx = argmax(result.rawPct)
  for (let i = 0; i < 4; i++) {
    const row = refs.advancedRows[i as 0 | 1 | 2 | 3]
    const pct = Math.round(result.rawPct[i as 0 | 1 | 2 | 3])
    setPct(row.fill, pct)
    row.pct.textContent = `${pct}%`
    if (i === winIdx) row.root.dataset.winner = 'true'
    else delete row.root.dataset.winner
  }
}
