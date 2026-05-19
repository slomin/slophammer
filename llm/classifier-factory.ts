import type { ClassifierRepository } from './classifier-repository'
import type { ModelStatusMessage } from '@/messaging/protocol'

export interface ClassifierFactoryDeps {
  isModelInstalled: () => Promise<boolean>
  createOnnxClassifier: () => Promise<ClassifierRepository>
  createFakeClassifier: () => ClassifierRepository
  onStatus: (s: ModelStatusMessage) => void
}

function status(partial: Omit<ModelStatusMessage, 'type'>): ModelStatusMessage {
  return { type: 'model:status', ...partial }
}

export async function createClassifierRepository(
  deps: ClassifierFactoryDeps,
): Promise<ClassifierRepository> {
  const { isModelInstalled, createOnnxClassifier, createFakeClassifier, onStatus } = deps

  if (!(await isModelInstalled())) {
    const fake = createFakeClassifier()
    onStatus(status({ status: 'ready' }))
    return fake
  }

  onStatus(status({ status: 'loading', progress: 1 }))
  try {
    const repo = await createOnnxClassifier()
    onStatus(status({ status: 'ready' }))
    return repo
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onStatus(status({ status: 'error', error: message }))
    return createFakeClassifier()
  }
}
