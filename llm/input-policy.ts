import { SUPPORTED_ARTIFACT } from './supported-artifact'

export const MIN_SELECTION_WORDS = SUPPORTED_ARTIFACT.minWords

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length
}

export function isSelectionLongEnough(text: string): boolean {
  return countWords(text) >= MIN_SELECTION_WORDS
}
