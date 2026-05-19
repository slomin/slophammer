import { describe, expect, it } from 'vitest'
import {
  HOSTED_MODEL,
  compareHostedVersions,
  parseHostedZipVersion,
  pickLatestHostedZip,
  resolveHostedZipUrl,
} from '@/install/hosted-model-config'

describe('HOSTED_MODEL config', () => {
  it('pins the Slomin/slop_hammer_0_8_b repo', () => {
    expect(HOSTED_MODEL.repoId).toBe('Slomin/slop_hammer_0_8_b')
  })

  it('points the tree API at main', () => {
    expect(HOSTED_MODEL.treeApiUrl).toBe(
      'https://huggingface.co/api/models/Slomin/slop_hammer_0_8_b/tree/main',
    )
  })

  it('pins a currentFilename that matches the version regex', () => {
    expect(HOSTED_MODEL.currentFilename).toBe('slop_hammer_0_8b_v0_1.zip')
    expect(parseHostedZipVersion(HOSTED_MODEL.currentFilename)).toEqual({ major: 0, minor: 1 })
  })
})

describe('resolveHostedZipUrl', () => {
  it('builds a resolve/main URL for a filename', () => {
    expect(resolveHostedZipUrl('slop_hammer_0_8b_v0_1.zip')).toBe(
      'https://huggingface.co/Slomin/slop_hammer_0_8_b/resolve/main/slop_hammer_0_8b_v0_1.zip',
    )
  })
})

describe('parseHostedZipVersion', () => {
  it('parses a canonical filename', () => {
    expect(parseHostedZipVersion('slop_hammer_0_8b_v0_1.zip')).toEqual({ major: 0, minor: 1 })
  })

  it('parses multi-digit versions', () => {
    expect(parseHostedZipVersion('slop_hammer_0_8b_v12_34.zip')).toEqual({ major: 12, minor: 34 })
  })

  it('returns null for non-matching names', () => {
    expect(parseHostedZipVersion('model.zip')).toBeNull()
    expect(parseHostedZipVersion('slop_hammer_0_8b_v0_1.txt')).toBeNull()
    expect(parseHostedZipVersion('other_v0_1.zip')).toBeNull()
  })
})

describe('compareHostedVersions', () => {
  it('orders by major, then minor', () => {
    expect(compareHostedVersions({ major: 0, minor: 1 }, { major: 0, minor: 2 })).toBe(-1)
    expect(compareHostedVersions({ major: 0, minor: 2 }, { major: 0, minor: 1 })).toBe(1)
    expect(compareHostedVersions({ major: 1, minor: 0 }, { major: 0, minor: 9 })).toBe(1)
    expect(compareHostedVersions({ major: 0, minor: 1 }, { major: 0, minor: 1 })).toBe(0)
  })
})

describe('pickLatestHostedZip', () => {
  it('returns the filename with the highest (major, minor)', () => {
    const files = [
      'slop_hammer_0_8b_v0_1.zip',
      'slop_hammer_0_8b_v0_3.zip',
      'slop_hammer_0_8b_v0_2.zip',
      'readme.md',
      'slop_hammer_0_8b_v1_0.zip',
    ]
    expect(pickLatestHostedZip(files)).toBe('slop_hammer_0_8b_v1_0.zip')
  })

  it('returns null when no versioned zip is present', () => {
    expect(pickLatestHostedZip(['readme.md', 'tokenizer.json'])).toBeNull()
  })

  it('returns the only versioned zip when there is one', () => {
    expect(pickLatestHostedZip(['slop_hammer_0_8b_v0_1.zip'])).toBe('slop_hammer_0_8b_v0_1.zip')
  })
})
