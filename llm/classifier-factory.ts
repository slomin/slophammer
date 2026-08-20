import type { ClassifierRepository } from './classifier-repository'
import type { ModelStatusMessage } from '@/messaging/protocol'

export const MODEL_NOT_INSTALLED_MESSAGE =
  'No model installed. Open SlopHammer options to install the verified classifier.'

/**
 * Raised when no real classifier can be produced. The caller must surface this
 * to the user rather than falling back to anything that returns a verdict —
 * a detector that silently invents results is worse than one that refuses to
 * answer.
 */
export class ClassifierUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClassifierUnavailableError'
  }
}

export interface ClassifierFactoryDeps {
  isModelInstalled: () => Promise<boolean>
  createOnnxClassifier: () => Promise<ClassifierRepository>
  onStatus: (s: ModelStatusMessage) => void
}

function status(partial: Omit<ModelStatusMessage, 'type'>): ModelStatusMessage {
  return { type: 'model:status', ...partial }
}

export async function createClassifierRepository(
  deps: ClassifierFactoryDeps,
): Promise<ClassifierRepository> {
  const { isModelInstalled, createOnnxClassifier, onStatus } = deps

  if (!(await isModelInstalled())) {
    onStatus(status({ status: 'not-installed' }))
    throw new ClassifierUnavailableError(MODEL_NOT_INSTALLED_MESSAGE)
  }

  onStatus(status({ status: 'loading', progress: 1 }))
  try {
    const repo = await createOnnxClassifier()
    onStatus(status({ status: 'ready' }))
    return repo
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onStatus(status({ status: 'error', error: message }))
    throw new ClassifierUnavailableError(message)
  }
}
