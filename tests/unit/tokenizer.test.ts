import { describe, expect, it } from 'vitest'
import { createTokenizer, resolveSpecialToken } from '@/llm/tokenizer'

/**
 * A hand-built WordPiece tokenizer. Small enough to read, big enough to prove
 * the parts that matter: added tokens, a template post-processor that inserts
 * [CLS]/[SEP], subword continuation, and an unknown token.
 */
const added = (id: number, content: string) => ({
  id,
  content,
  single_word: false,
  lstrip: false,
  rstrip: false,
  normalized: false,
  special: true,
})

const TOKENIZER_JSON = {
  version: '1.0',
  truncation: null,
  padding: null,
  added_tokens: [
    added(0, '[PAD]'),
    added(1, '[CLS]'),
    added(2, '[SEP]'),
    added(3, '[UNK]'),
    added(4, '[EOS]'),
  ],
  normalizer: null,
  pre_tokenizer: { type: 'WhitespaceSplit' },
  post_processor: {
    type: 'TemplateProcessing',
    single: [
      { SpecialToken: { id: '[CLS]', type_id: 0 } },
      { Sequence: { id: 'A', type_id: 0 } },
      { SpecialToken: { id: '[SEP]', type_id: 0 } },
    ],
    pair: [
      { Sequence: { id: 'A', type_id: 0 } },
      { Sequence: { id: 'B', type_id: 1 } },
    ],
    special_tokens: {
      '[CLS]': { id: '[CLS]', ids: [1], tokens: ['[CLS]'] },
      '[SEP]': { id: '[SEP]', ids: [2], tokens: ['[SEP]'] },
    },
  },
  decoder: null,
  model: {
    type: 'WordPiece',
    unk_token: '[UNK]',
    continuing_subword_prefix: '##',
    max_input_chars_per_word: 100,
    vocab: {
      '[PAD]': 0,
      '[CLS]': 1,
      '[SEP]': 2,
      '[UNK]': 3,
      '[EOS]': 4,
      slop: 5,
      '##hammer': 6,
      checks: 7,
      text: 8,
    },
  },
}

describe('createTokenizer', () => {
  it('returns the encoded ids as a BigInt64Array, in order', () => {
    const tokenizer = createTokenizer(TOKENIZER_JSON, { pad_token: '[PAD]' })

    const { data } = tokenizer('slophammer checks text').input_ids

    expect(data).toBeInstanceOf(BigInt64Array)
    expect([...data]).toEqual([1n, 5n, 6n, 7n, 8n, 2n])
  })

  it('adds the template special tokens by default and when asked explicitly', () => {
    const tokenizer = createTokenizer(TOKENIZER_JSON, { pad_token: '[PAD]' })

    expect([...tokenizer('checks text').input_ids.data]).toEqual([1n, 7n, 8n, 2n])
    expect([...tokenizer('checks text', { add_special_tokens: true }).input_ids.data]).toEqual([
      1n,
      7n,
      8n,
      2n,
    ])
  })

  it('omits them when add_special_tokens is false', () => {
    const tokenizer = createTokenizer(TOKENIZER_JSON, { pad_token: '[PAD]' })

    expect([...tokenizer('checks text', { add_special_tokens: false }).input_ids.data]).toEqual([
      7n,
      8n,
    ])
  })

  it('maps an out-of-vocabulary word to the unknown token', () => {
    const tokenizer = createTokenizer(TOKENIZER_JSON, { pad_token: '[PAD]' })

    expect([...tokenizer('mystery').input_ids.data]).toEqual([1n, 3n, 2n])
  })

  it('resolves pad_token_id from the config pad token', () => {
    expect(createTokenizer(TOKENIZER_JSON, { pad_token: '[PAD]' }).pad_token_id).toBe(0)
  })

  it('accepts the serialized AddedToken form of a pad token', () => {
    const config = { pad_token: { __type: 'AddedToken', content: '[PAD]' } }

    expect(createTokenizer(TOKENIZER_JSON, config).pad_token_id).toBe(0)
  })

  it('falls back to the end-of-sequence token when no pad token is configured', () => {
    expect(createTokenizer(TOKENIZER_JSON, { eos_token: '[EOS]' }).pad_token_id).toBe(4)
  })

  // The loader treats an absent pad id as fatal after exhausting tokenizer.json
  // and the contract (see resolveRuntimeContract). Inventing 0 here would put a
  // confident, wrongly-padded score in front of the user — see #10.
  it('leaves pad_token_id undefined when neither token is configured', () => {
    expect(createTokenizer(TOKENIZER_JSON, {}).pad_token_id).toBeUndefined()
  })

  it('leaves pad_token_id undefined when the configured token is not in the vocabulary', () => {
    expect(createTokenizer(TOKENIZER_JSON, { pad_token: '[NOPE]' }).pad_token_id).toBeUndefined()
  })
})

describe('resolveSpecialToken', () => {
  it('takes the first key that is present and non-empty', () => {
    expect(resolveSpecialToken({ pad_token: '[PAD]', eos_token: '[EOS]' }, 'pad_token', 'eos_token')).toBe(
      '[PAD]',
    )
    expect(resolveSpecialToken({ pad_token: null, eos_token: '[EOS]' }, 'pad_token', 'eos_token')).toBe(
      '[EOS]',
    )
    expect(resolveSpecialToken({}, 'pad_token', 'eos_token')).toBeNull()
  })

  it('unwraps the AddedToken object form', () => {
    expect(
      resolveSpecialToken({ pad_token: { __type: 'AddedToken', content: '[PAD]' } }, 'pad_token'),
    ).toBe('[PAD]')
  })

  it('refuses an object shape it does not recognise rather than guessing', () => {
    expect(() => resolveSpecialToken({ pad_token: { content: '[PAD]' } }, 'pad_token')).toThrow(
      /Unrecognised special token/,
    )
  })
})
