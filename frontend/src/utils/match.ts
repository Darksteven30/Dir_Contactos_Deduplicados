import type { ContactMatch } from '@/types/api'

/** "José  PÉREZ" → "jose perez": misma regla que usa el backend para comparar nombres. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export const percent = (score: number) => `${Math.round(score * 100)}%`

/** Razones legibles de por qué dos contactos se parecen: "mismo nombre · mismo teléfono". */
export function describeMatch(match: ContactMatch): string[] {
  const reasons: string[] = []
  if (match.nameSimilarity >= 0.999) reasons.push('mismo nombre')
  else if (match.nameSimilarity >= 0.6)
    reasons.push(`nombre ${percent(match.nameSimilarity)} parecido`)
  if (match.emailMatch) reasons.push('mismo email')
  if (match.phoneMatch) reasons.push('mismo teléfono')
  return reasons
}
