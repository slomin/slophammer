import { describe, expect, it } from 'vitest'
import { buildSentinel, parseSentinel, type SentinelPayload } from '@/install/sentinel'

describe('buildSentinel', () => {
  it('produces a valid payload with a fresh timestamp', () => {
    const before = Date.now()
    const payload = buildSentinel({ checkpointId: '4500', contractFile: 'slop_hammer_contract.json' })
    const after = Date.now()
    expect(payload.checkpointId).toBe('4500')
    expect(payload.contractFile).toBe('slop_hammer_contract.json')
    expect(payload.installedAt).toBeGreaterThanOrEqual(before)
    expect(payload.installedAt).toBeLessThanOrEqual(after)
  })

  it('accepts explicit installedAt for deterministic tests', () => {
    const payload = buildSentinel({
      checkpointId: 'v1',
      contractFile: 'seq_cls_contract.json',
      installedAt: 1700000000000,
    })
    expect(payload.installedAt).toBe(1700000000000)
  })
})

describe('parseSentinel', () => {
  it('parses a serialised payload', () => {
    const original: SentinelPayload = {
      checkpointId: 'ckpt4500',
      installedAt: 1700000000000,
      contractFile: 'slop_hammer_contract.json',
    }
    const parsed = parseSentinel(JSON.stringify(original))
    expect(parsed).toEqual(original)
  })

  it('returns null for garbage input', () => {
    expect(parseSentinel('')).toBeNull()
    expect(parseSentinel('not-json')).toBeNull()
    expect(parseSentinel('{}')).toBeNull()
    expect(parseSentinel('null')).toBeNull()
    expect(parseSentinel('{"checkpointId":"x"}')).toBeNull() // missing installedAt
  })

  it('returns null when installedAt is not a number', () => {
    expect(parseSentinel('{"checkpointId":"x","installedAt":"yesterday","contractFile":"a.json"}')).toBeNull()
  })
})

describe('roundtrip', () => {
  it('build → stringify → parse is lossless', () => {
    const payload = buildSentinel({
      checkpointId: 'abc',
      contractFile: 'seq_cls_contract.json',
      installedAt: 12345,
    })
    expect(parseSentinel(JSON.stringify(payload))).toEqual(payload)
  })
})
