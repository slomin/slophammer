import { describe, expect, it } from 'vitest'
import {
  buildStartedMessage,
  countWords,
  isSelectionLongEnough,
  MIN_SELECTION_CHARS,
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
  it('rejects strings shorter than MIN_SELECTION_CHARS', () => {
    expect(isSelectionLongEnough('short')).toBe(false)
    expect(isSelectionLongEnough('x'.repeat(MIN_SELECTION_CHARS - 1))).toBe(false)
  })

  it('accepts strings at or above MIN_SELECTION_CHARS', () => {
    expect(isSelectionLongEnough('x'.repeat(MIN_SELECTION_CHARS))).toBe(true)
    expect(isSelectionLongEnough('x'.repeat(MIN_SELECTION_CHARS + 10))).toBe(true)
  })

  it('measures trimmed length', () => {
    const padded = '   ' + 'x'.repeat(MIN_SELECTION_CHARS) + '   '
    expect(isSelectionLongEnough(padded)).toBe(true)
    const coreShort = '   ' + 'x'.repeat(MIN_SELECTION_CHARS - 1) + '   '
    expect(isSelectionLongEnough(coreShort)).toBe(false)
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
