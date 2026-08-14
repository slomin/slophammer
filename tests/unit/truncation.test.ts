import { describe, expect, it } from 'vitest'
import { formatTruncationNote } from '@/content/truncation'

// The model only ever sees the last max_seq_length tokens. Previously the card
// showed the full word count of the selection with no indication that most of
// it had never been analysed.
describe('formatTruncationNote', () => {
  it('returns null when the whole selection was analysed', () => {
    expect(formatTruncationNote({ truncated: false, tokenCount: 120, analysedTokens: 120 })).toBeNull()
  })

  it('reports what was actually analysed when truncated', () => {
    expect(formatTruncationNote({ truncated: true, tokenCount: 1665, analysedTokens: 512 })).toBe(
      'Analysed the last 512 of 1,665 tokens',
    )
  })

  it('groups thousands so long selections stay readable', () => {
    expect(formatTruncationNote({ truncated: true, tokenCount: 20000, analysedTokens: 512 })).toBe(
      'Analysed the last 512 of 20,000 tokens',
    )
  })

  it('returns null if the numbers do not indicate a real truncation', () => {
    // Defensive: a truncated flag with nothing dropped would be misleading.
    expect(formatTruncationNote({ truncated: true, tokenCount: 512, analysedTokens: 512 })).toBeNull()
    expect(formatTruncationNote({ truncated: true, tokenCount: 400, analysedTokens: 512 })).toBeNull()
  })
})
