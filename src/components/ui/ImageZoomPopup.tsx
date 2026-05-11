import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'

interface ImageZoomPopupProps {
  src: string
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 8

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function ImageZoomPopup({ src, onClose }: ImageZoomPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const dragging = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number } | null>(null)

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Initial auto-zoom for small images
  useLayoutEffect(() => {
    if (!loaded) return
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    if (!nw || !nh) return
    // fit-to-screen scale (1 means "object-contain at base")
    const fitScale = Math.min(cw / nw, ch / nh)
    // if image is small (uses < 70% of either dim at fit), scale up so it fills more
    if (fitScale > 1 / 0.7) {
      // image is small — boost initial scale so the displayed size is ~ min(viewport*0.85, 1.5x natural)
      const target = Math.min(cw * 0.85 / nw, ch * 0.85 / nh, 2.5)
      setScale(Math.max(1, target / Math.min(1, fitScale)))
    } else {
      setScale(1)
    }
    setTx(0)
    setTy(0)
  }, [loaded])

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = 1 + (-e.deltaY * 0.0015)
      setScale(s => clamp(s * factor, MIN_SCALE, MAX_SCALE))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragging.current = { startX: e.clientX, startY: e.clientY, baseTx: tx, baseTy: ty }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setTx(dragging.current.baseTx + (e.clientX - dragging.current.startX))
    setTy(dragging.current.baseTy + (e.clientY - dragging.current.startY))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = null
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {}
  }

  const reset = () => {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden flex items-center justify-center select-none"
        style={{ cursor: dragging.current ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging.current ? 'none' : 'transform 0.08s linear',
          }}
        />
      </div>

      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          type="button"
          onClick={reset}
          aria-label="Zoom zurücksetzen"
          title="Zurücksetzen"
          className="w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen (Esc)"
          title="Schließen (Esc)"
          className="w-10 h-10 rounded-full bg-bg-800/80 hover:bg-bg-700 border border-bg-600 flex items-center justify-center text-ink-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-ink-400 text-xs bg-bg-900/70 border border-bg-700 rounded-full px-3 py-1.5 pointer-events-none">
        Mausrad: zoomen · Ziehen: verschieben · Esc: schließen
      </div>
    </div>
  )
}
