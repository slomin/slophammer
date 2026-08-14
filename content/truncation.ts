export interface TruncationFacts {
  truncated: boolean
  /** Tokens in the whole selection. */
  tokenCount: number
  /** Tokens the model actually saw — max_seq_length when truncated. */
  analysedTokens: number
}

/**
 * The classifier keeps only the last `max_seq_length` tokens of a long
 * selection, so a verdict on a 1,665-token passage may be based on 512 of them.
 * Returns the note to show the user, or null when nothing was dropped.
 */
export function formatTruncationNote(facts: TruncationFacts): string | null {
  if (!facts.truncated) return null
  if (facts.analysedTokens >= facts.tokenCount) return null
  const total = facts.tokenCount.toLocaleString('en-US')
  const seen = facts.analysedTokens.toLocaleString('en-US')
  return `Analysed the last ${seen} of ${total} tokens`
}
