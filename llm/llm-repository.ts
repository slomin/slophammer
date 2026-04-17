export interface LlmRepository {
  scoreSlop(text: string): Promise<number>
}
