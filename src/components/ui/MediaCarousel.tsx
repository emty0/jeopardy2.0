import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import type { MediaItem } from '#/lib/game-state'
import { getYoutubeId } from '#/lib/format'
import { YoutubeEmbed } from './YoutubeEmbed'

interface MediaCarouselProps {
  items: MediaItem[]
  autoplay?: boolean
  className?: string
  allowFullscreen?: boolean
  /** Crop YouTube title bar. Default true. Set false on answer-reveal where spoilers don't matter. */
  cropChrome?: boolean
}

function MediaSlide({
  item,
  autoplay,
  fullscreen,
  cropChrome,
}: {
  item: MediaItem
  autoplay: boolean
  fullscreen: boolean
  cropChrome: boolean
}) {
  const wrapper = fullscreen
    ? 'rounded-none border-none bg-transparent shadow-none w-full h-full flex items-center justify-center'
    : 'rounded-2xl overflow-hidden border border-bg-700/60 bg-bg-900 shadow-[var(--shadow-tile)]'

  if (item.type === 'youtube') {
    const id = getYoutubeId(item.url)
    if (!id) return null
    return (
      <div className={fullscreen ? `${wrapper}` : `${wrapper} w-full max-w-3xl`}>
        <YoutubeEmbed id={id} autoplay={autoplay} fullscreen={fullscreen} cropChrome={cropChrome} />
      </div>
    )
  }

  if (item.type === 'image') {
    return (
      <div className={fullscreen ? `${wrapper}` : `${wrapper} flex items-center justify-center max-w-3xl`}>
        <img
          src={item.url}
          alt=""
          className={fullscreen ? 'max-w-full max-h-full object-contain' : 'max-w-full max-h-[55vh] object-contain'}
        />
      </div>
    )
  }

  if (item.type === 'audio') {
    return (
      <div className="flex items-center justify-center w-full">
        <audio src={item.url} autoPlay={autoplay} controls className="w-full max-w-md" />
      </div>
    )
  }

  if (item.type === 'video') {
    return (
      <div className={fullscreen ? `${wrapper}` : `${wrapper} max-w-3xl`}>
        <video
          src={item.url}
          autoPlay={autoplay}
          controls
          playsInline
          className={fullscreen ? 'max-w-full max-h-full object-contain bg-black' : 'w-full max-h-[55vh] object-contain bg-black'}
        />
      </div>
    )
  }

  return null
}

export function MediaCarousel({
  items,
  autoplay = false,
  className = '',
  allowFullscreen = true,
  cropChrome = true,
}: MediaCarouselProps) {
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [autoplayIdx, setAutoplayIdx] = useState(0)
  const prevLenRef = useRef(items.length)

  const go = useCallback(
    (next: number) => {
      setDir(next > idx ? 1 : -1)
      setIdx(next)
      setAutoplayIdx(-1)
    },
    [idx],
  )

  // When items grow (e.g. master reveals next medium), jump to the newly added item
  // and mark it as auto-revealed so autoplay can fire for it.
  useEffect(() => {
    const prev = prevLenRef.current
    if (items.length > prev) {
      setDir(1)
      setIdx(items.length - 1)
      setAutoplayIdx(items.length - 1)
    } else if (idx >= items.length && items.length > 0) {
      setIdx(items.length - 1)
    }
    prevLenRef.current = items.length
  }, [items.length, idx])

  // Esc to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  if (items.length === 0) return null

  const current = items[idx]
  const showFullscreenBtn = allowFullscreen && current.type !== 'audio'

  const carouselBody = (
    <div
      className={
        isFullscreen
          ? 'w-full h-full flex flex-col items-center justify-center gap-4'
          : `w-full flex flex-col items-center gap-3 ${className}`
      }
    >
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 min-h-0 flex items-center justify-center'
            : 'relative w-full flex items-center justify-center'
        }
      >
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go((idx - 1 + items.length) % items.length)}
            className={`absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors ${
              isFullscreen ? 'left-4' : 'left-0'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className={`${isFullscreen ? 'w-full h-full' : 'w-full'} flex justify-center overflow-hidden`}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={current.id}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 60 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -60 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className={`${isFullscreen ? 'w-full h-full' : 'w-full'} flex justify-center items-center`}
            >
              <MediaSlide
                item={current}
                autoplay={autoplay && idx === autoplayIdx}
                fullscreen={isFullscreen}
                cropChrome={cropChrome}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go((idx + 1) % items.length)}
            className={`absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors ${
              isFullscreen ? 'right-4' : 'right-0'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {showFullscreenBtn && (
          <button
            type="button"
            onClick={() => setIsFullscreen(v => !v)}
            aria-label={isFullscreen ? 'Vollbild beenden (Esc)' : 'Vollbild'}
            title={isFullscreen ? 'Vollbild beenden (Esc)' : 'Vollbild'}
            className={`absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors ${
              isFullscreen ? 'top-4 right-4' : 'top-2 right-2'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              className={[
                'rounded-full transition-all',
                i === idx
                  ? 'w-5 h-2 bg-cyan-400'
                  : 'w-2 h-2 bg-bg-600 hover:bg-bg-500',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </div>
  )

  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center p-6"
        role="dialog"
        aria-modal="true"
      >
        {carouselBody}
      </div>
    )
  }

  return carouselBody
}
