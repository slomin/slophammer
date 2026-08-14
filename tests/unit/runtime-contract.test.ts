import { describe, expect, it } from 'vitest'
import { resolveRuntimeContract } from '@/llm/runtime-contract'
import type { SlopHammerContract } from '@/llm/contract'

const base: SlopHammerContract = {
  n_buckets: 4,
  lo_threshold: 0.03,
  hi_threshold: 0.15,
  max_seq_length: 512,
}

// The shipping contract (Slomin/slop_hammer_0_8_b) sets none of these three,
// and its tokenizer.json declares padding {direction: 'Left', pad_id: 248044}.
const shippingTokenizerPadding = { direction: 'Left', pad_id: 248044 }

describe('resolveRuntimeContract — the shipping model', () => {
  it('resolves every value from authoritative sources without the contract stating them', () => {
    const rt = resolveRuntimeContract({
      contract: base,
      tokenizerPadding: shippingTokenizerPadding,
      sessionOutputNames: ['logits'],
    })
    expect(rt).toEqual({ padId: 248044n, padSide: 'left', outputName: 'logits' })
  })
})

describe('resolveRuntimeContract — precedence', () => {
  // The tokenizer performs the padding; the contract only describes the export.
  it('prefers the tokenizer over the contract for pad id and side', () => {
    const rt = resolveRuntimeContract({
      contract: { ...base, pad_token_id: 7, padding_side: 'right' },
      tokenizerPadId: 248044,
      tokenizerPadding: shippingTokenizerPadding,
      sessionOutputNames: ['logits'],
    })
    expect(rt.padId).toBe(248044n)
    expect(rt.padSide).toBe('left')
  })

  // Hugging Face serializes "padding": null unless padding was enabled at save
  // time, leaving the tokenizer object as the only source. Dropping it made
  // such models fail to load at all.
  it('uses the tokenizer pad id when tokenizer.json has no padding block', () => {
    const rt = resolveRuntimeContract({
      contract: { ...base, padding_side: 'left' },
      tokenizerPadId: 128001,
      tokenizerPadding: null,
      sessionOutputNames: ['logits'],
    })
    expect(rt.padId).toBe(128001n)
  })

  it('falls back to the contract pad id when the tokenizer offers none', () => {
    const rt = resolveRuntimeContract({
      contract: { ...base, pad_token_id: 7 },
      tokenizerPadding: { direction: 'Left' },
      sessionOutputNames: ['logits'],
    })
    expect(rt.padId).toBe(7n)
  })

  it('prefers the contract over the session for the output name', () => {
    const rt = resolveRuntimeContract({
      contract: { ...base, output_name: 'scores' },
      tokenizerPadding: shippingTokenizerPadding,
      sessionOutputNames: ['logits'],
    })
    expect(rt.outputName).toBe('scores')
  })

  it('accepts either case of the tokenizer direction', () => {
    for (const direction of ['Left', 'left', 'LEFT']) {
      expect(
        resolveRuntimeContract({
          contract: base,
          tokenizerPadding: { direction, pad_id: 1 },
          sessionOutputNames: ['logits'],
        }).padSide,
      ).toBe('left')
    }
    expect(
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: { direction: 'Right', pad_id: 1 },
        sessionOutputNames: ['logits'],
      }).padSide,
    ).toBe('right')
  })

  it('uses the only session output when there is exactly one', () => {
    expect(
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: shippingTokenizerPadding,
        sessionOutputNames: ['some_other_head'],
      }).outputName,
    ).toBe('some_other_head')
  })
})

// The point of #10: never invent a value and score confidently with it.
describe('resolveRuntimeContract — fails loudly rather than defaulting', () => {
  it('throws when no pad id is available anywhere', () => {
    expect(() =>
      resolveRuntimeContract({
        contract: base,
        tokenizerPadId: null,
        tokenizerPadding: { direction: 'Left' },
        sessionOutputNames: ['logits'],
      }),
    ).toThrow(/pad_token_id/)
  })

  it('never silently falls back to pad id 0', () => {
    try {
      resolveRuntimeContract({ contract: base, tokenizerPadding: null, sessionOutputNames: ['logits'] })
      throw new Error('should have thrown')
    } catch (err) {
      expect(String(err)).toMatch(/pad_token_id/)
    }
  })

  it('throws when no padding side is available anywhere', () => {
    expect(() =>
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: { pad_id: 5 },
        sessionOutputNames: ['logits'],
      }),
    ).toThrow(/padding_side/)
  })

  it('throws when the tokenizer direction is not a recognised side', () => {
    expect(() =>
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: { pad_id: 5, direction: 'sideways' },
        sessionOutputNames: ['logits'],
      }),
    ).toThrow(/padding_side/)
  })

  it('throws when the session exposes several outputs and the contract is silent', () => {
    expect(() =>
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: shippingTokenizerPadding,
        sessionOutputNames: ['logits', 'hidden_states'],
      }),
    ).toThrow(/multiple outputs.*logits, hidden_states/)
  })

  it('throws when the session reports no outputs at all', () => {
    expect(() =>
      resolveRuntimeContract({
        contract: base,
        tokenizerPadding: shippingTokenizerPadding,
        sessionOutputNames: [],
      }),
    ).toThrow(/no outputs/)
  })
})
