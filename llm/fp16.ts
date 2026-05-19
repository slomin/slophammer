const SIGN_MASK = 0x8000
const EXP_MASK = 0x7c00
const MANT_MASK = 0x03ff
const EXP_ALL_ONES = 0x1f

export function fp16ToFp32(bits: number): number {
  const s = (bits & SIGN_MASK) >> 15
  const e = (bits & EXP_MASK) >> 10
  const f = bits & MANT_MASK
  const sign = s ? -1 : 1

  if (e === 0) {
    return sign * Math.pow(2, -14) * (f / 1024)
  }
  if (e === EXP_ALL_ONES) {
    return f !== 0 ? NaN : sign * Infinity
  }
  return sign * Math.pow(2, e - 15) * (1 + f / 1024)
}
