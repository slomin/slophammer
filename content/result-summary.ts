import type { ClassifyResult } from '@/llm/classify-result'
import { formatPct } from '@/llm/classify-result'
import { PRODUCT_NAME } from '@/shared/product'

export function formatResultSummary(result: ClassifyResult): string {
  const distribution = result.bucketLabels
    .map((label, i) => `${label} ${formatPct(result.rawPct[i as 0 | 1 | 2 | 3])}%`)
    .join(' · ')

  return [
    `${PRODUCT_NAME}: AI Content Detector`,
    `Distribution: ${distribution}`,
  ].join('\n')
}
