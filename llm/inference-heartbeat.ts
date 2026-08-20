export async function withHeartbeat<T>(
  work: () => Promise<T>,
  pulse: () => void,
  intervalMs: number,
): Promise<T> {
  const timer = setInterval(pulse, intervalMs)
  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}
