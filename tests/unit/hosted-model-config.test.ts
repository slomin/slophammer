import { describe, expect, it } from 'vitest'
import {
  HOSTED_MODEL,
  pickLatestHostedZip,
  resolveHostedZipUrl,
} from '@/install/hosted-model-config'
import { SUPPORTED_ARTIFACT } from '@/llm/supported-artifact'

describe('HOSTED_MODEL', () => {
  it('pins the exact supported 350M artifact', () => {
    expect(HOSTED_MODEL).toEqual({
      repoId: SUPPORTED_ARTIFACT.repoId,
      treeApiUrl: SUPPORTED_ARTIFACT.treeApiUrl,
      currentFilename: SUPPORTED_ARTIFACT.filename,
      expectedSize: SUPPORTED_ARTIFACT.size,
      expectedSha256: SUPPORTED_ARTIFACT.sha256,
    })
    expect(resolveHostedZipUrl(SUPPORTED_ARTIFACT.filename)).toBe(
      'https://huggingface.co/Slomin/slophammer_350m/resolve/main/slophammer_350m_v0_1.zip',
    )
  })

  it('never selects an unknown future or retired artifact', () => {
    expect(pickLatestHostedZip(['slophammer_350m_v0_2.zip'])).toBeNull()
    expect(pickLatestHostedZip(['slop_hammer_0_8b_v0_1.zip'])).toBeNull()
    expect(resolveHostedZipUrl('slophammer_350m_v0_2.zip')).toBe('')
  })
})
