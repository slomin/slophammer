import type { ClassifierRepository } from './classifier-repository'
import {
  computeExtLlr,
  decideVerdict,
  softmax,
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
import type { RuntimeContract } from './runtime-contract'
import type { RuntimeDiagnostics } from './execution-provider'
import { padInputIds } from './token-preparation'

export interface OnnxClassifierDeps {
  tokenizer: TokenizerLike
  session: InferenceSessionLike
  contract: SlopHammerContract
  createTensor: TensorFactory
  /**
   * pad id, padding side and output name, resolved up front from the contract
   * or another authoritative source. Never defaulted — see #10.
   */
  runtime: RuntimeContract
  runtimeDiagnostics?: RuntimeDiagnostics
}

export class OnnxClassifierRepository implements ClassifierRepository {
  readonly runtimeDiagnostics?: RuntimeDiagnostics

  constructor(private readonly deps: OnnxClassifierDeps) {
    this.runtimeDiagnostics = deps.runtimeDiagnostics
  }

  async dispose(): Promise<void> {
    await this.deps.session.release?.()
  }

  async classify(text: string): Promise<ClassifyResult> {
    const { tokenizer, session, contract, createTensor, runtime } = this.deps
    const maxSeq = contract.max_seq_length
    const { padId, padSide } = runtime

    const preparedText = preprocessClassifierText(text, contract.preprocessing)
    const enc = tokenizer(preparedText, { add_special_tokens: true })
    const { inputIds, attnMask, origLen, seqLen, truncated } = padInputIds({
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

    const outputName = runtime.outputName
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
      const extLlr = computeExtLlr(probs)
      const { tau, abstain_band: abstainBand } = contract.calibration
      const verdict = decideVerdict(extLlr, tau, abstainBand)

      return {
        probs,
        rawPct: [probs[0] * 100, probs[1] * 100, probs[2] * 100, probs[3] * 100],
        bucketLabels: [...contract.labels] as [string, string, string, string],
        extLlr,
        threshold: tau,
        verdict,
        tokenCount: origLen,
        analysedTokens: seqLen,
        truncated,
      }
    } finally {
      logitsTensor.dispose?.()
    }
  }
}

const ZERO_WIDTH = /[\u200B\u200C\u200D\u2060\uFEFF]/g

export function preprocessClassifierText(
  text: string,
  preprocessing: SlopHammerContract['preprocessing'],
): string {
  if (preprocessing !== 'trim+zw') {
    throw new Error(`Unsupported preprocessing: ${String(preprocessing)}`)
  }
  return text.replace(ZERO_WIDTH, '').trim()
}
