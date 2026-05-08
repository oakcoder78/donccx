export function generateSeed(userId: string, currentDate: Date): string {
  const dateStr = currentDate.toISOString().split('T')[0]
  return `${userId}:${dateStr}`
}

export function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export function deterministicIndex(length: number, seed: string): number {
  return hashSeed(seed) % length
}