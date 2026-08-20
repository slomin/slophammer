import { argmax4, type ClassifyResult } from '@/llm/classify-result'
import type { CardElements } from './card-dom'
import type { CardState } from './state'
import { formatTruncationNote } from './truncation'
import { formatAnalysisTime } from './timing'
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

export function renderState(card: CardElements, state: CardState): void {
  const { refs } = card
  refs.root.dataset.state = state.kind

  switch (state.kind) {
    case 'idle':
      // Host stays in DOM but card-root display:none keeps it invisible.
      hide(refs.truncationNote)
      hide(refs.loadingRow)
      hide(refs.verdictBox)
      hide(refs.modeRow)
      hide(refs.advanced)
      hide(refs.errorBox)
      hide(refs.actionsRow)
      return

    case 'loading':
      refs.preview.textContent = state.preview
      refs.wordCount.textContent = `${state.wordCount} words`
      hide(refs.truncationNote)
      show(refs.loadingRow)
      hide(refs.verdictBox)
      hide(refs.modeRow)
      hide(refs.advanced)
      hide(refs.errorBox)
      hide(refs.actionsRow)
      return

    case 'ready': {
      refs.preview.textContent = state.preview
      refs.wordCount.textContent = `${state.wordCount} words`
      renderReady(card, state.result, state.durationMs)
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
      refs.wordCount.textContent = `${state.wordCount} words`
      refs.errorMessage.textContent = state.error
      hide(refs.truncationNote)
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

function renderReady(card: CardElements, result: ClassifyResult, durationMs: number): void {
  const { refs } = card

  // The model only reads the last max_seq_length tokens, so say so rather than
  // implying the whole selection was judged.
  const note = formatTruncationNote(result)
  if (note) {
    refs.truncationNote.textContent = note
    show(refs.truncationNote)
  } else {
    refs.truncationNote.textContent = ''
    hide(refs.truncationNote)
  }

  const binary = computeBinary(result.rawPct)
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

  const winIdx = argmax4(result.probs)
  for (let i = 0; i < 4; i++) {
    const row = refs.advancedRows[i as 0 | 1 | 2 | 3]
    const pct = Math.round(result.rawPct[i as 0 | 1 | 2 | 3])
    setPct(row.fill, pct)
    row.name.textContent = result.bucketLabels[i]!
    row.pct.textContent = `${pct}%`
    if (i === winIdx) row.root.dataset.winner = 'true'
    else delete row.root.dataset.winner
  }
  refs.analysisTime.textContent = `Analysis time ${formatAnalysisTime(durationMs)}`
}
