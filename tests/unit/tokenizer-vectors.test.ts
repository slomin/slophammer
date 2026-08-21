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
const VOCAB = resolve(TOKENIZER_DIR, 'tokenizer.json')
const CONFIG = resolve(TOKENIZER_DIR, 'tokenizer_config.json')
const available = existsSync(VOCAB) && existsSync(CONFIG)

// There is no CI, and the vocabulary is not in git, so on a fresh checkout this
// file simply skips — `pnpm test` is green whether or not these ran. Set
// SLOPHAMMER_REQUIRE_VECTORS=1 to make its absence a failure instead, which is
// what a release check or anyone deliberately bumping the tokenizer should do.
if (!available && process.env.SLOPHAMMER_REQUIRE_VECTORS === '1') {
  throw new Error(
    'SLOPHAMMER_REQUIRE_VECTORS=1 but the vocabulary is missing. Extract it with:\n' +
      '  unzip -o -j references/models/slophammer_350m_v0_1.zip \\\n' +
      '    tokenizer.json tokenizer_config.json -d references/models/tokenizer',
  )
}

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe.skipIf(!available)('SlopHammer 350M token vectors', () => {
  const tokenizer = available
    ? createTokenizer(
        JSON.parse(readFileSync(VOCAB, 'utf8')),
        JSON.parse(readFileSync(CONFIG, 'utf8')),
      )
    : null

  // Both files, not just the vocabulary: tokenizer_config.json is the only
  // input to the pad-token assertion below, and an edited one would otherwise
  // surface as a bare "expected 0, received undefined".
  it('is checking the files these vectors were recorded from', () => {
    expect(sha(VOCAB)).toBe(vectors.tokenizerSha256)
    expect(sha(CONFIG)).toBe(vectors.tokenizerConfigSha256)
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
