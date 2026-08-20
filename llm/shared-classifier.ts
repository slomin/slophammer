import type { ClassifierRepository } from './classifier-repository'

export interface SharedClassifier {
  get(): Promise<ClassifierRepository>
  current(): Promise<ClassifierRepository> | null
  replace(next: Promise<ClassifierRepository>): void
}

/** One lazy classifier promise for the whole offscreen document and every tab. */
export function createSharedClassifier(
  factory: () => Promise<ClassifierRepository>,
): SharedClassifier {
  let current: Promise<ClassifierRepository> | null = null
  return {
    get() {
      if (!current) current = factory()
      return current
    },
    current: () => current,
    replace(next) {
      current = next
    },
  }
}
