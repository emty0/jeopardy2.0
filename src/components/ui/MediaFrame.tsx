import { getYoutubeId } from '#/lib/format'
import { YoutubeEmbed } from './YoutubeEmbed'

interface MediaFrameProps {
  youtubeUrl: string | null
  mediaUrl: string | null
  mediaType: string | null
  size?: 'sm' | 'lg'
  autoplay?: boolean
  className?: string
  /** Crop YouTube title bar. Default true. Set false on answer-reveal contexts. */
  cropChrome?: boolean
}

export function MediaFrame({
  youtubeUrl,
  mediaUrl,
  mediaType,
  size = 'lg',
  autoplay = false,
  className = '',
  cropChrome = true,
}: MediaFrameProps) {
  const hasYoutube = Boolean(youtubeUrl)
  const hasMedia = Boolean(mediaUrl)
  if (!hasYoutube && !hasMedia) return null

  const wrapper =
    'rounded-[var(--radius-card)] overflow-hidden border border-bg-700/60 bg-bg-900 shadow-[var(--shadow-tile)]'

  const maxClasses = size === 'sm' ? 'max-w-md max-h-48' : 'max-w-3xl'

  if (hasYoutube) {
    const id = getYoutubeId(youtubeUrl!)
    if (!id) return null
    return (
      <div className={[wrapper, 'w-full', maxClasses, className].join(' ')}>
        <YoutubeEmbed id={id} autoplay={autoplay} cropChrome={cropChrome} />
      </div>
    )
  }

  if (mediaType === 'image') {
    return (
      <div className={[wrapper, 'flex items-center justify-center', maxClasses, className].join(' ')}>
        <img src={mediaUrl!} alt="" className="max-w-full max-h-[60vh] object-contain" />
      </div>
    )
  }

  if (mediaType === 'audio') {
    return (
      <div className={['flex items-center justify-center w-full', className].join(' ')}>
        <audio src={mediaUrl!} autoPlay={autoplay} controls className="w-full max-w-md" />
      </div>
    )
  }

  if (mediaType === 'video') {
    return (
      <div className={[wrapper, maxClasses, className].join(' ')}>
        <video
          src={mediaUrl!}
          autoPlay={autoplay}
          controls
          playsInline
          className="w-full max-h-[60vh] object-contain bg-black"
        />
      </div>
    )
  }

  return null
}
