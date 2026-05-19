export type PadSide = 'left' | 'right'

export interface PadArgs {
  tokens: BigInt64Array
  maxSeq: number
  padId: bigint
  padSide: PadSide
}

export interface PadResult {
  inputIds: BigInt64Array
  attnMask: BigInt64Array
  origLen: number
  seqLen: number
  truncated: boolean
}

export function padInputIds({ tokens, maxSeq, padId, padSide }: PadArgs): PadResult {
  const origLen = tokens.length
  const truncated = origLen > maxSeq
  const seqLen = Math.min(origLen, maxSeq)
  // When truncated, always keep the last `seqLen` tokens.
  const srcStart = truncated ? origLen - seqLen : 0

  const inputIds = new BigInt64Array(maxSeq)
  const attnMask = new BigInt64Array(maxSeq)
  inputIds.fill(padId)

  const dstStart = padSide === 'left' ? maxSeq - seqLen : 0
  for (let i = 0; i < seqLen; i++) {
    inputIds[dstStart + i] = tokens[srcStart + i]!
    attnMask[dstStart + i] = 1n
  }

  return { inputIds, attnMask, origLen, seqLen, truncated }
}
