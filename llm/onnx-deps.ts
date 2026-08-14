export interface TokenizerOutput {
  input_ids: { data: BigInt64Array }
}

export interface TokenizerLike {
  (text: string, options?: { add_special_tokens?: boolean }): TokenizerOutput
  pad_token_id?: number
}

export interface TensorLike {
  data?: ArrayBufferView
  getData?: (release?: boolean) => Promise<ArrayBufferView>
  type?: string
  dispose?: () => void
}

export interface InferenceSessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>
  /** Declared by ONNX Runtime; used to resolve the output name without guessing. */
  outputNames?: readonly string[]
  release?(): Promise<void>
}

export type TensorFactory = (
  kind: 'int64',
  data: BigInt64Array,
  dims: [number, number],
) => unknown

export async function readTensorData(t: TensorLike): Promise<ArrayBufferView> {
  if (typeof t.getData === 'function') {
    return await t.getData(false)
  }
  if (t.data) {
    return t.data
  }
  throw new Error('tensor has neither .data nor .getData()')
}
