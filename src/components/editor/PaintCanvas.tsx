import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../ui/Button'
import { canvasToBlob, loadImage } from '#/lib/canvas-utils'

type Point = { x: number; y: number }
type Stroke = { color: string; width: number; points: Point[] }

const PALETTE = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#FFFFFF', '#000000']

interface Props {
  imageUrl: string
  onCommit: (blob: Blob) => void
  busy?: boolean
}

export function PaintCanvas({ imageUrl, onCommit, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [color, setColor] = useState<string>(PALETTE[0])
  const [width, setWidth] = useState<number>(6)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [active, setActive] = useState<Stroke | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [, setTick] = useState(0) // force redraw when image loads

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
      setStrokes([])
      setActive(null)
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
    const drawStroke = (s: Stroke) => {
      if (s.points.length === 0) return
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
    }
    for (const s of strokes) drawStroke(s)
    if (active) drawStroke(active)
  }, [strokes, active])

  function toCanvasCoords(e: ReactPointerEvent<HTMLCanvasElement>): Point {
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
    setActive({ color, width, points: [p] })
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!active) return
    const p = toCanvasCoords(e)
    setActive({ ...active, points: [...active.points, p] })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!active) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setStrokes(prev => [...prev, active])
    setActive(null)
  }

  function undo() {
    setStrokes(prev => prev.slice(0, -1))
  }

  function clearAll() {
    setStrokes([])
    setActive(null)
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
          <span className="text-xs uppercase tracking-wider text-ink-500">Farbe</span>
          {PALETTE.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={[
                'w-7 h-7 rounded-full border-2 transition-all',
                color === c ? 'border-cyan-400 scale-110' : 'border-bg-600',
              ].join(' ')}
              style={{ backgroundColor: c }}
              aria-label={`Farbe ${c}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink-500">Stärke</span>
          <input
            type="range"
            min={1}
            max={40}
            value={width}
            onChange={e => setWidth(Number(e.target.value))}
            className="w-32 accent-cyan-400"
          />
          <span className="text-sm text-ink-200 tabular-nums w-8">{width}px</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="subtle" onClick={undo} disabled={strokes.length === 0 || busy}>
            Rückgängig
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll} disabled={strokes.length === 0 || busy}>
            Alles löschen
          </Button>
          <Button size="sm" variant="accent" onClick={commit} disabled={strokes.length === 0 || busy}>
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
