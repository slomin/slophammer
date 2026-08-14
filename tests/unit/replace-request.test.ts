import { describe, expect, it } from 'vitest'
import { NOT_A_ZIP_MESSAGE, decideReplace } from '@/install/replace-request'

// Replacing an installed model overwrites it destructively — runInstall calls
// resetModelDir() before validating a single byte. So the extension is checked
// before the user is asked to confirm: being told "this isn't a zip" after
// confirming an overwrite would be backwards.
describe('decideReplace', () => {
  it('asks for confirmation for a .zip', () => {
    const decision = decideReplace('slop_hammer_0_8b_v0_4_600.zip')
    expect(decision.kind).toBe('confirm')
  })

  it('names the picked file in the prompt so the user sees what they chose', () => {
    const decision = decideReplace('slop_hammer_0_8b_v0_1.zip')
    expect(decision.kind === 'confirm' && decision.prompt).toContain('slop_hammer_0_8b_v0_1.zip')
  })

  it('warns that the overwrite cannot be undone', () => {
    // There is no staging or rollback: a bad zip leaves no model at all.
    const decision = decideReplace('model.zip')
    expect(decision.kind === 'confirm' && decision.prompt).toMatch(/cannot be undone/i)
  })

  it('accepts an uppercase extension', () => {
    expect(decideReplace('MODEL.ZIP').kind).toBe('confirm')
  })

  it.each(['notes.txt', 'model.tar.gz', 'model.zip.part', 'model', ''])(
    'rejects %o without prompting to confirm',
    (name) => {
      const decision = decideReplace(name)
      expect(decision).toEqual({ kind: 'reject', message: NOT_A_ZIP_MESSAGE })
    },
  )

  it('reuses the existing rejection wording', () => {
    // Same string the first-time install path has always shown.
    expect(NOT_A_ZIP_MESSAGE).toBe('Please pick a .zip file.')
  })
})
