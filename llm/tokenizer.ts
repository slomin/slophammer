/**
 * The tokenizer half of the classifier, built directly on
 * `@huggingface/tokenizers`.
 *
 * This used to come from `@huggingface/transformers`, of which we imported one
 * symbol — `PreTrainedTokenizer` — whose constructor is itself little more than
 * `new Tokenizer(tokenizerJSON, tokenizerConfig)` from this package. The cost of
 * that convenience was the whole transformers barrel, which reaches its ONNX
 * backend through `utils/tensor.js` and so dragged a *second* copy of ONNX
 * Runtime Web into the extension: 23.5 MB of WebAssembly that was downloaded,
 * stored, and never executed (#34).
 *
 * The encode below is exactly what `PreTrainedTokenizer._call` performed for our
 * single call site: no padding and no truncation — `llm/token-preparation.ts`
 * owns both — and ids widened to int64 for the session input. Parity against the
 * real SlopHammer 350M tokenizer was verified token-for-token before the swap.
 */

import { Tokenizer } from '@huggingface/tokenizers'
import type { TokenizerLike } from './onnx-deps'

/**
 * Reads a special token out of tokenizer_config.json, trying each key in turn.
 *
 * Hugging Face writes these three ways depending on when and how the tokenizer
 * was saved: a plain string, the older `{__type: 'AddedToken', content}` form,
 * or a bare `{content, lstrip, rstrip, normalized, single_word}` dict. Any
 * object carrying a string `content` is accepted; transformers' own helper only
 * recognised the `__type` form and threw on the modern dict.
 *
 * An object with no usable content still throws rather than being skipped:
 * moving on to the next key would pad with the *end-of-sequence* id instead of
 * the pad id, silently, and produce a confident wrong score — the failure mode
 * #10 was about.
 */
export function resolveSpecialToken(config: unknown, ...keys: string[]): string | null {
  if (typeof config !== 'object' || config === null) return null
  const record = config as Record<string, unknown>

  for (const key of keys) {
    const item = record[key]
    if (!item) continue
    if (typeof item === 'string') return item
    const { content } = item as { content?: unknown }
    // An empty content is treated as absent, matching the plain-string branch
    // above — but it still throws rather than falling through, because moving on
    // would pad with the end-of-sequence id in place of the pad id, silently.
    if (typeof content === 'string' && content.length > 0) return content
    throw new Error(`Unrecognised special token for '${key}': ${JSON.stringify(item)}`)
  }

  return null
}

/**
 * Builds the tokenizer the classifier runs on from the two installed JSON files.
 *
 * `pad_token_id` is left `undefined` when the config names no pad or
 * end-of-sequence token, or names one the vocabulary does not contain. The
 * loader then falls through to tokenizer.json's padding block and the model
 * contract, and fails naming what is missing rather than defaulting to 0.
 */
export function createTokenizer(tokenizerJson: unknown, tokenizerConfig: unknown): TokenizerLike {
  const tokenizer = new Tokenizer(tokenizerJson as object, tokenizerConfig as object)
  const padToken = resolveSpecialToken(tokenizerConfig, 'pad_token', 'eos_token')

  const encode: TokenizerLike = (text, options) => {
    const { ids } = tokenizer.encode(text, {
      text_pair: null,
      add_special_tokens: options?.add_special_tokens ?? true,
      return_token_type_ids: false,
    })
    return {
      input_ids: {
        data: BigInt64Array.from(ids, (id) => {
          // `encode` falls back to the model's `unk_token_id`, which is itself
          // undefined when tokenizer.json declares no unknown token. The pinned
          // 350M artifact is byte-level BPE so every byte maps and this cannot
          // fire, but `BigInt(undefined)` is a bare TypeError several frames
          // from its cause — name the problem instead.
          if (typeof id !== 'number') {
            throw new Error(
              'Tokenizer produced a token with no id; the vocabulary declares no unknown token to fall back to.',
            )
          }
          return BigInt(id)
        }),
      },
    }
  }

  encode.pad_token_id = padToken === null ? undefined : tokenizer.token_to_id(padToken)
  return encode
}
