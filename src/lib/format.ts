export function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/)
  return m ? m[1] : null
}

export function formatPoints(value: number): string {
  return value.toLocaleString('de-DE')
}

export function formatDelta(value: number): string {
  if (value === 0) return '±0'
  return value > 0 ? `+${formatPoints(value)}` : `−${formatPoints(Math.abs(value))}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || '?'
}
