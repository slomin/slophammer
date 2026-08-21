import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTokenizer } from '@/llm/tokenizer'
import vectors from '../fixtures/tokenizer-350m-vectors.json'

/**
 * Drift detector for the real classifier tokenizer.
 *
 * The specs in tokenizer.test.ts run against a nine-token hand-built fixture:
 * they prove the adapter's contract, not that `@huggingface/tokenizers` still
 * splits the pinned SlopHammer 350M vocabulary the same way. A single changed
 * token id shifts the logits and can flip a verdict across the calibration
 * threshold with nothing raising an error, so the ids these cases produced when
 * the tokenizer was swapped are recorded verbatim and re-checked here.
 *
 * The vocabulary is 4.7 MB and lives in the installable artifact rather than in
 * git, so the whole file skips until it is extracted:
 *
 *   unzip -o -j references/models/slophammer_350m_v0_1.zip \
 *     tokenizer.json tokenizer_config.json -d references/models/tokenizer
 *
 * `@huggingface/tokenizers` is pinned to an exact version for the same reason;
 * these vectors are what makes a deliberate bump safe to accept.
 */
const TOKENIZER_DIR = resolve(__dirname, '../../references/models/tokenizer')
const available =
  existsSync(resolve(TOKENIZER_DIR, 'tokenizer.json')) &&
  existsSync(resolve(TOKENIZER_DIR, 'tokenizer_config.json'))

describe.skipIf(!available)('SlopHammer 350M token vectors', () => {
  const raw = available ? readFileSync(resolve(TOKENIZER_DIR, 'tokenizer.json')) : Buffer.alloc(0)
  const tokenizer = available
    ? createTokenizer(
        JSON.parse(raw.toString('utf8')),
        JSON.parse(readFileSync(resolve(TOKENIZER_DIR, 'tokenizer_config.json'), 'utf8')),
      )
    : null

  it('is checking the vocabulary these vectors were recorded from', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(vectors.tokenizerSha256)
  })

  it('resolves the recorded pad token id', () => {
    expect(tokenizer?.pad_token_id).toBe(vectors.padTokenId)
  })

  it.each(vectors.cases.map((c) => [`${c.label} (add_special_tokens=${c.addSpecialTokens})`, c]))(
    'encodes %s to the recorded ids',
    (_label, testCase) => {
      const { data } = tokenizer!(testCase.text, {
        add_special_tokens: testCase.addSpecialTokens,
      }).input_ids

      expect([...data].map(Number)).toEqual(testCase.ids)
    },
  )
})
