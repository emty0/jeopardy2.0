// Player color palette — vibrante Farben, die mit dem Violet/Cyan-Theme harmonieren
// und untereinander gut unterscheidbar sind.
export const PLAYER_COLOR_PALETTE = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#EC4899', // pink
  '#84CC16', // lime
  '#14B8A6', // teal
  '#A855F7', // purple
  '#F43F5E', // rose
] as const

export type PlayerColor = typeof PLAYER_COLOR_PALETTE[number]

/**
 * Pick the first palette color not yet used by other players in the session.
 * Falls back to deterministic hashing if the palette is exhausted.
 */
export function pickPlayerColor(usedColors: string[], seed: string): string {
  const free = PLAYER_COLOR_PALETTE.find(c => !usedColors.includes(c))
  if (free) return free
  // All colors taken → deterministic fallback
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const idx = Math.abs(hash) % PLAYER_COLOR_PALETTE.length
  return PLAYER_COLOR_PALETTE[idx]
}
