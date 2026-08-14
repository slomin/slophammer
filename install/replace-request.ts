/**
 * Shown when a picked file is not a `.zip`. Shared by the first-time install
 * path and by replacing an already-installed model, so both refuse in the same
 * words.
 */
export const NOT_A_ZIP_MESSAGE = 'Please pick a .zip file.'

export type ReplaceDecision =
  | { kind: 'reject'; message: string }
  | { kind: 'confirm'; prompt: string }

/**
 * Decides what should happen when the user picks a file to replace the
 * installed model with.
 *
 * The extension is checked *before* confirming: `runInstall` deletes the
 * installed model before it validates anything, so a wrong pick is destructive
 * and the user should not be asked to approve an overwrite that would then be
 * refused anyway.
 */
/** The single accept rule for a picked model bundle. */
export function isZipFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip')
}

export function decideReplace(filename: string): ReplaceDecision {
  if (!isZipFilename(filename)) {
    return { kind: 'reject', message: NOT_A_ZIP_MESSAGE }
  }
  return {
    kind: 'confirm',
    prompt:
      `Replace the installed model with "${filename}"?\n\n` +
      'This overwrites the current model and cannot be undone.',
  }
}
