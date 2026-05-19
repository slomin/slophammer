import type { ClassifierRepository } from './classifier-repository'
import {
  argmax4,
  bucketFromArgmax,
  softmax,
  VERDICT_HEADLINE,
  VERDICT_PRIMARY_LABEL,
  type ClassifyResult,
  type RawProbs,
} from './classify-result'
import type { SlopHammerContract } from './contract'
import { extractLogits } from './logits-extraction'
import {
  readTensorData,
  type InferenceSessionLike,
  type TensorFactory,
  type TokenizerLike,
} from './onnx-deps'
import { padInputIds } from './token-preparation'

const DEFAULT_OUTPUT_NAME = 'logits'
const DEFAULT_PAD_SIDE = 'left' as const

export interface OnnxClassifierDeps {
  tokenizer: TokenizerLike
  session: InferenceSessionLike
  contract: SlopHammerContract
  createTensor: TensorFactory
}

export class OnnxClassifierRepository implements ClassifierRepository {
  constructor(private readonly deps: OnnxClassifierDeps) {}

  async classify(text: string): Promise<ClassifyResult> {
    const { tokenizer, session, contract, createTensor } = this.deps
    const maxSeq = contract.max_seq_length
    const padId = BigInt(tokenizer.pad_token_id ?? contract.pad_token_id ?? 0)
    const padSide = contract.padding_side ?? DEFAULT_PAD_SIDE

    const enc = tokenizer(text, { add_special_tokens: true })
    const { inputIds, attnMask, origLen, truncated } = padInputIds({
      tokens: enc.input_ids.data,
      maxSeq,
      padId,
      padSide,
    })

    const inputIdsTensor = createTensor('int64', inputIds, [1, maxSeq])
    const attnTensor = createTensor('int64', attnMask, [1, maxSeq])

    const outputs = await session.run({
      input_ids: inputIdsTensor,
      attention_mask: attnTensor,
    })

    const outputName = contract.output_name ?? DEFAULT_OUTPUT_NAME
    const logitsTensor = outputs[outputName]
    if (!logitsTensor) {
      throw new Error(
        `Missing output '${outputName}' in model output. Available: ${Object.keys(outputs).join(', ')}`,
      )
    }

    try {
      const raw = await readTensorData(logitsTensor)
      const logits = extractLogits(raw)
      const [p0, p1, p2, p3] = softmax(logits)
      const probs: RawProbs = [p0!, p1!, p2!, p3!]
      const argmax = argmax4(probs)
      const verdict = bucketFromArgmax(argmax)

      return {
        probs,
        rawPct: [probs[0] * 100, probs[1] * 100, probs[2] * 100, probs[3] * 100],
        aiScore: 1 - probs[0],
        humanPct: verdict === 'human' ? 100 : 0,
        mixedPct: verdict === 'mixed' ? 100 : 0,
        aiPct: verdict === 'ai' ? 100 : 0,
        verdict,
        primaryPct: 100,
        primaryLabel: VERDICT_PRIMARY_LABEL[verdict],
        headline: VERDICT_HEADLINE[verdict],
        tokenCount: origLen,
        truncated,
      }
    } finally {
      logitsTensor.dispose?.()
    }
  }
}
