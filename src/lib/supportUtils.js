export function calcSupportPercentages(n1, n2, n3) {
  const total = (n1 || 0) + (n2 || 0) + (n3 || 0)
  if (total === 0) return { pct1: 0, pct2: 0, pct3: 0 }
  return {
    pct1: Math.round((n1 || 0) / total * 100),
    pct2: Math.round((n2 || 0) / total * 100),
    pct3: Math.round((n3 || 0) / total * 100),
  }
}
