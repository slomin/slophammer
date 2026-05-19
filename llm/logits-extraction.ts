import type { RawProbs } from './classify-result'
import { fp16ToFp32 } from './fp16'

export type LogitTuple = [number, number, number, number]

export function extractLogits(data: ArrayBufferView): LogitTuple {
  const ctor = data.constructor.name

  if (ctor === 'Float32Array' || ctor === 'Float16Array') {
    const arr = data as unknown as { length: number; [i: number]: number }
    if (arr.length !== 4) {
      throw new Error(`Expected 4 logits, got ${arr.length}`)
    }
    return [arr[0]!, arr[1]!, arr[2]!, arr[3]!]
  }

  if (data instanceof Uint16Array) {
    if (data.length !== 4) {
      throw new Error(`Expected 4 fp16 logits, got ${data.length}`)
    }
    return [
      fp16ToFp32(data[0]!),
      fp16ToFp32(data[1]!),
      fp16ToFp32(data[2]!),
      fp16ToFp32(data[3]!),
    ]
  }

  throw new Error(`Unsupported logits array type: ${ctor}`)
}

export function logitsToProbs(logits: LogitTuple, softmaxFn: (x: readonly number[]) => number[]): RawProbs {
  const [a, b, c, d] = softmaxFn(logits)
  return [a!, b!, c!, d!]
}
