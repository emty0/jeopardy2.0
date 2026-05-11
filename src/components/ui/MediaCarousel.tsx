import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import type { MediaItem } from '#/lib/game-state'
import { getYoutubeId } from '#/lib/format'
import { YoutubeEmbed, type YoutubeEmbedHandle } from './YoutubeEmbed'
import { ImageZoomPopup } from './ImageZoomPopup'

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
  cropChrome,
  videoRef,
  youtubeRef,
}: {
  item: MediaItem
  autoplay: boolean
  cropChrome: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  youtubeRef: React.RefObject<YoutubeEmbedHandle | null>
}) {
  const wrapper = 'rounded-2xl overflow-hidden border border-bg-700/60 bg-bg-900 shadow-[var(--shadow-tile)]'

  if (item.type === 'youtube') {
    const id = getYoutubeId(item.url)
    if (!id) return null
    return (
      <div className={`${wrapper} w-full max-w-3xl`}>
        <YoutubeEmbed ref={youtubeRef} id={id} autoplay={autoplay} cropChrome={cropChrome} />
      </div>
    )
  }

  if (item.type === 'image') {
    return (
      <div className={`${wrapper} flex items-center justify-center max-w-3xl`}>
        <img
          src={item.url}
          alt=""
          className="max-w-full max-h-[55vh] object-contain"
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
      <div className={`${wrapper} max-w-3xl`}>
        <video
          ref={videoRef}
          src={item.url}
          autoPlay={autoplay}
          controls
          playsInline
          className="w-full max-h-[55vh] object-contain bg-black"
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
  const [imagePopupOpen, setImagePopupOpen] = useState(false)
  const [autoplayIdx, setAutoplayIdx] = useState(0)
  const prevLenRef = useRef(items.length)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const youtubeRef = useRef<YoutubeEmbedHandle | null>(null)

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

  const current = items.length > 0 ? items[idx] : null

  const requestFullscreen = useCallback(() => {
    if (!current) return
    if (current.type === 'youtube') {
      youtubeRef.current?.requestFullscreen()
    } else if (current.type === 'video') {
      videoRef.current?.requestFullscreen?.()
    } else if (current.type === 'image') {
      setImagePopupOpen(true)
    }
  }, [current])

  // Esc shortcut for fullscreen.
  // Split keydown/keyup: arm on keydown, fire on keyup — avoids the OS-level
  // "Esc exits fullscreen" shortcut from undoing the entry on the same
  // physical keypress.
  useEffect(() => {
    if (!allowFullscreen || !current || current.type === 'audio') return
    if (imagePopupOpen) return
    let armed = false
    const isInputTarget = (t: EventTarget | null) =>
      !!(t as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isInputTarget(e.target)) return
      if (document.fullscreenElement) return
      e.preventDefault()
      e.stopImmediatePropagation()
      armed = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!armed) return
      armed = false
      e.preventDefault()
      e.stopImmediatePropagation()
      requestFullscreen()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions)
      window.removeEventListener('keyup', onKeyUp, { capture: true } as EventListenerOptions)
    }
  }, [allowFullscreen, current, imagePopupOpen, requestFullscreen])

  if (items.length === 0 || !current) return null

  const showFullscreenBtn = allowFullscreen && current.type !== 'audio'

  return (
    <>
      <div className={`w-full flex flex-col items-center gap-3 ${className}`}>
        <div className="relative w-full flex items-center justify-center">
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => go((idx - 1 + items.length) % items.length)}
              className="absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors left-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-full flex justify-center overflow-hidden">
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
                className="w-full flex justify-center items-center"
              >
                <MediaSlide
                  item={current}
                  autoplay={autoplay && idx === autoplayIdx}
                  cropChrome={cropChrome}
                  videoRef={videoRef}
                  youtubeRef={youtubeRef}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => go((idx + 1) % items.length)}
              className="absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors right-0"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {showFullscreenBtn && (
            <button
              type="button"
              onClick={requestFullscreen}
              aria-label="Vollbild (Esc)"
              title="Vollbild (Esc)"
              className="absolute z-10 w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors top-2 right-2"
            >
              <Maximize2 className="w-4 h-4" />
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

      {imagePopupOpen && current.type === 'image' && (
        <ImageZoomPopup src={current.url} onClose={() => setImagePopupOpen(false)} />
      )}
    </>
  )
}
