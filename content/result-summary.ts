import type { ClassifyResult } from '@/llm/classify-result'
import { formatTruncationNote } from './truncation'
import { ADVANCED_DRAWER_LABELS, computeBinary, verdictDescriptor } from './verdict'

/**
 * The text put on the clipboard by Copy, and shared by Share.
 *
 * Built from the same helpers the card renders from, so the copied text always
 * agrees with what is on screen — including the rounding, which is done once so
 * the two halves cannot add up to 99 or 101.
 */
export function formatResultSummary(result: ClassifyResult): string {
  const binary = computeBinary(result.rawPct)
  const winPct = Math.round(binary.winPct)
  const losePct = 100 - winPct
  const descriptor = verdictDescriptor(winPct, binary.winner)

  const humanPct = binary.winner === 'human' ? winPct : losePct
  const aiPct = binary.winner === 'ai' ? winPct : losePct

  const distribution = ADVANCED_DRAWER_LABELS.map(
    (label, i) => `${label} ${Math.round(result.rawPct[i as 0 | 1 | 2 | 3])}%`,
  ).join(' · ')

  const lines = [
    `Slop Hammer: ${descriptor.label} ${winPct}% (${descriptor.confidenceText})`,
    descriptor.sentence,
    `Human ${humanPct}% · AI ${aiPct}%`,
    `Distribution: ${distribution}`,
  ]

  const truncation = formatTruncationNote(result)
  if (truncation) lines.push(truncation)

  return lines.join('\n')
}
