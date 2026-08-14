import type { SlopHammerContract } from './contract'

export type PadSide = 'left' | 'right'

/** The `padding` block from tokenizer.json — the tokenizer's own declaration. */
export interface TokenizerPadding {
  direction?: unknown
  pad_id?: unknown
}

export interface ResolveRuntimeContractArgs {
  contract: SlopHammerContract
  /** `pad_token_id` as the loaded tokenizer resolved it. */
  tokenizerPadId?: number | null
  tokenizerPadding?: TokenizerPadding | null
  /** Output names reported by the loaded ONNX session. */
  sessionOutputNames?: readonly string[]
}

export interface RuntimeContract {
  padId: bigint
  padSide: PadSide
  outputName: string
}

function firstNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function normalisePadSide(value: unknown): PadSide | null {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase()
  return v === 'left' || v === 'right' ? v : null
}

/**
 * Resolves the three inference parameters the runtime cannot guess safely.
 *
 * These used to fall back to hardcoded values — pad_token_id 0, padding_side
 * 'left', output_name 'logits' — which meant an incomplete or mismatched
 * contract still produced confident, wrong scores (see #10). The shipping
 * contract omits all three, so simply requiring them would reject the live
 * model. Instead each value is taken from an authoritative source: the
 * tokenizer itself, otherwise tokenizer.json's serialized padding block,
 * otherwise the contract's declaration, otherwise the session's declared
 * outputs. The tokenizer wins because it is what actually performs the
 * padding; the contract describes the export. Nothing is invented — if a value
 * cannot be established the load fails naming what is missing.
 *
 * Note that a Hugging Face tokenizer.json commonly serializes `"padding": null`
 * when padding was not enabled at save time, in which case the pad token is
 * only reachable through the tokenizer object.
 */
export function resolveRuntimeContract(args: ResolveRuntimeContractArgs): RuntimeContract {
  const { contract, tokenizerPadding, sessionOutputNames } = args

  const padId =
    firstNumber(args.tokenizerPadId) ??
    firstNumber(tokenizerPadding?.pad_id) ??
    firstNumber(contract.pad_token_id)
  if (padId === null) {
    throw new Error(
      'Cannot determine pad_token_id: the tokenizer does not expose one, tokenizer.json has no padding.pad_id, and the model contract does not set it.',
    )
  }

  const padSide =
    normalisePadSide(tokenizerPadding?.direction) ?? normalisePadSide(contract.padding_side)
  if (padSide === null) {
    throw new Error(
      'Cannot determine padding_side: tokenizer.json has no padding.direction and the model contract does not set it.',
    )
  }

  const outputName = resolveOutputName(contract.output_name, sessionOutputNames)

  return { padId: BigInt(padId), padSide, outputName }
}

function resolveOutputName(
  declared: string | undefined,
  sessionOutputNames: readonly string[] | undefined,
): string {
  if (typeof declared === 'string' && declared.length > 0) return declared
  const names = sessionOutputNames ?? []
  if (names.length === 1) return names[0]!
  if (names.length === 0) {
    throw new Error(
      'Cannot determine output_name: the model contract does not set it and the session reports no outputs.',
    )
  }
  throw new Error(
    `Cannot determine output_name: the model contract does not set it and the session has multiple outputs (${names.join(', ')}).`,
  )
}
