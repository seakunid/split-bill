export const PAYER_COLORS = ['#0b6e4f', '#c2410c', '#1d4ed8', '#7c3aed', '#b45309', '#0f766e', '#be123c', '#0369a1'] as const

export function payerColor(index: number): string {
  return PAYER_COLORS[index % PAYER_COLORS.length] ?? PAYER_COLORS[0]
}

export function payerInitial(name: string): string {
  const trimmed = name.trim()
  const first = [...trimmed][0]
  return first ? first.toUpperCase() : '?'
}
