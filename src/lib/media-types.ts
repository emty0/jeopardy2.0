export type MediaType = 'image' | 'audio' | 'video' | 'youtube'

export function isImage(type: string | null | undefined): boolean {
  return type === 'image'
}

export function isVideo(type: string | null | undefined): boolean {
  return type === 'video'
}

export function isAudio(type: string | null | undefined): boolean {
  return type === 'audio'
}

export function isEditable(type: string | null | undefined): boolean {
  return isImage(type) || isVideo(type)
}

export function mediaTypeFromMime(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'image'
}
