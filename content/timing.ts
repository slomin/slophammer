export function formatAnalysisTime(durationMs: number): string {
  const safeMs = Math.max(0, durationMs)
  if (safeMs < 100) return 'sub 0.1s'
  return `${Number((safeMs / 1000).toFixed(2))}s`
}
