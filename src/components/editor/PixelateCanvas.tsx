import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../ui/Button'
import { canvasToBlob, loadImage, pixelateRegion } from '#/lib/canvas-utils'

type Rect = { x: number; y: number; w: number; h: number }

interface Props {
  imageUrl: string
  onCommit: (blob: Blob) => void
  busy?: boolean
}

export function PixelateCanvas({ imageUrl, onCommit, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [blockSize, setBlockSize] = useState<number>(14)
  const [appliedRects, setAppliedRects] = useState<Rect[]>([])
  const [drawing, setDrawing] = useState<Rect | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadImage(imageUrl).then(img => {
      if (cancelled) return
      imgRef.current = img
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
      }
      setAppliedRects([])
      setDrawing(null)
      setTick(t => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    for (const r of appliedRects) {
      pixelateRegion(ctx, r.x, r.y, r.w, r.h, blockSize)
    }
    if (drawing) {
      ctx.save()
      ctx.strokeStyle = '#22D3EE'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.strokeRect(drawing.x, drawing.y, drawing.w, drawing.h)
      ctx.fillStyle = 'rgba(34, 211, 238, 0.15)'
      ctx.fillRect(drawing.x, drawing.y, drawing.w, drawing.h)
      ctx.restore()
    }
  }, [appliedRects, drawing, blockSize])

  function toCanvasCoords(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toCanvasCoords(e)
    startRef.current = p
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!startRef.current) return
    const p = toCanvasCoords(e)
    const s = startRef.current
    const x = Math.min(s.x, p.x)
    const y = Math.min(s.y, p.y)
    const w = Math.abs(p.x - s.x)
    const h = Math.abs(p.y - s.y)
    setDrawing({ x, y, w, h })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (drawing.w >= 4 && drawing.h >= 4) {
      setAppliedRects(prev => [...prev, drawing])
    }
    setDrawing(null)
    startRef.current = null
  }

  function undo() {
    setAppliedRects(prev => prev.slice(0, -1))
  }

  function clearAll() {
    setAppliedRects([])
    setDrawing(null)
  }

  async function commit() {
    const canvas = canvasRef.current
    if (!canvas) return
    const blob = await canvasToBlob(canvas, 'image/png')
    onCommit(blob)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-bg-800/50 border border-bg-700 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink-500">Block-Größe</span>
          <input
            type="range"
            min={4}
            max={48}
            value={blockSize}
            onChange={e => setBlockSize(Number(e.target.value))}
            className="w-40 accent-cyan-400"
          />
          <span className="text-sm text-ink-200 tabular-nums w-10">{blockSize}px</span>
        </div>
        <div className="text-xs text-ink-500">
          Rechteck ziehen, um einen Bereich zu verpixeln. Mehrere möglich.
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="subtle"
            onClick={undo}
            disabled={appliedRects.length === 0 || busy}
          >
            Rückgängig
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAll}
            disabled={appliedRects.length === 0 || busy}
          >
            Alles löschen
          </Button>
          <Button
            size="sm"
            variant="accent"
            onClick={commit}
            disabled={appliedRects.length === 0 || busy}
          >
            Auf Bild anwenden
          </Button>
        </div>
      </div>
      <div
        className="bg-bg-950 border border-bg-700 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ minHeight: 320 }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="touch-none cursor-crosshair max-w-full max-h-[60vh] object-contain"
          style={{ display: 'block' }}
        />
      </div>
    </div>
  )
}
