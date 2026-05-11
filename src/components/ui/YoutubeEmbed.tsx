import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Play } from 'lucide-react'

export interface YoutubeEmbedHandle {
  requestFullscreen: () => void
}

interface YoutubeEmbedProps {
  id: string
  autoplay?: boolean
  className?: string
  fullscreen?: boolean
  /** Crops the YouTube title bar by shifting iframe up. Default true.
   *  Set false in spoiler-safe contexts (e.g. answer reveal) where the title can be shown. */
  cropChrome?: boolean
}

const PARAMS = 'enablejsapi=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1'

export const YoutubeEmbed = forwardRef<YoutubeEmbedHandle, YoutubeEmbedProps>(function YoutubeEmbed({
  id,
  autoplay = false,
  className = '',
  fullscreen = false,
  cropChrome = true,
}, ref) {
  const [started, setStarted] = useState(autoplay)
  const [thumbSrc, setThumbSrc] = useState(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
  const [isNativeFs, setIsNativeFs] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onFsChange = () => {
      setIsNativeFs(document.fullscreenElement === iframeRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useImperativeHandle(ref, () => ({
    requestFullscreen: () => {
      if (!started) {
        setStarted(true)
        setTimeout(() => {
          iframeRef.current?.requestFullscreen?.()
        }, 50)
        return
      }
      iframeRef.current?.requestFullscreen?.()
    },
  }), [started])

  useEffect(() => {
    if (autoplay) setStarted(true)
  }, [autoplay, id])

  useEffect(() => {
    setThumbSrc(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
    if (!autoplay) setStarted(false)
  }, [id, autoplay])

  const sizing = fullscreen
    ? 'w-[min(100vw,177.78vh)] aspect-video max-w-full max-h-full'
    : 'w-full aspect-video'

  if (!started) {
    return (
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setStarted(true)}
        aria-label="Video abspielen"
        className={`relative ${sizing} ${className} group bg-black overflow-hidden`}
      >
        <img
          src={thumbSrc}
          alt=""
          onError={() => setThumbSrc(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-violet-600/90 group-hover:bg-violet-500 border border-violet-300/40 shadow-[var(--shadow-glow)] flex items-center justify-center transition-colors">
            <Play className="w-9 h-9 lg:w-11 lg:h-11 text-white fill-white translate-x-0.5" />
          </div>
        </div>
      </button>
    )
  }

  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&${PARAMS}`

  return (
    <div className={`relative ${sizing} ${className} bg-black overflow-hidden`}>
      <iframe
        ref={iframeRef}
        src={src}
        className={cropChrome && !isNativeFs ? 'absolute left-0 w-full' : 'absolute inset-0 w-full h-full'}
        style={cropChrome && !isNativeFs ? { top: '-15%', height: '115%' } : undefined}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
})
