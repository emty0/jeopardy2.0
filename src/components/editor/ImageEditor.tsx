import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Button } from '../ui/Button'
import { PaintCanvas } from './PaintCanvas'
import { PixelateCanvas } from './PixelateCanvas'
import { canvasToBlob, getCroppedBlob, loadImage, uploadBlob } from '#/lib/canvas-utils'

type Tab = 'crop' | 'paint' | 'pixelate'

interface Props {
  initialUrl: string
  onSaved: (newUrl: string) => void
  onCancel: () => void
}

export function ImageEditor({ initialUrl, onSaved, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('crop')
  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const objectUrlsRef = useRef<string[]>([])
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState<number>(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  useEffect(() => {
    return () => {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u)
      objectUrlsRef.current = []
    }
  }, [])

  function setNewUrlFromBlob(blob: Blob) {
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.push(url)
    setCurrentUrl(url)
    setDirty(true)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }

  async function applyCrop() {
    if (!croppedAreaPixels) return
    setBusy(true)
    try {
      const img = await loadImage(currentUrl)
      const blob = await getCroppedBlob(img, croppedAreaPixels, 'image/png')
      setNewUrlFromBlob(blob)
    } finally {
      setBusy(false)
    }
  }

  async function flattenAndSave() {
    setBusy(true)
    try {
      const img = await loadImage(currentUrl)
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas-Kontext fehlt')
      ctx.drawImage(img, 0, 0)
      const blob = await canvasToBlob(canvas, 'image/png')
      const url = await uploadBlob(blob, `edit-${Date.now()}.png`)
      onSaved(url)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2 border-b border-bg-700 pb-3">
        <TabButton active={tab === 'crop'} onClick={() => setTab('crop')}>
          Zuschneiden
        </TabButton>
        <TabButton active={tab === 'paint'} onClick={() => setTab('paint')}>
          Zeichnen
        </TabButton>
        <TabButton active={tab === 'pixelate'} onClick={() => setTab('pixelate')}>
          Verpixeln
        </TabButton>
      </div>

      {tab === 'crop' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-bg-800/50 border border-bg-700 rounded-xl">
            <span className="text-xs uppercase tracking-wider text-ink-500">Format</span>
            <div className="flex items-center gap-1">
              {(
                [
                  { label: 'Frei', value: undefined },
                  { label: '1:1', value: 1 },
                  { label: '4:3', value: 4 / 3 },
                  { label: '16:9', value: 16 / 9 },
                ] as const
              ).map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setAspect(opt.value)}
                  className={[
                    'h-8 px-3 rounded-lg text-xs font-bold transition-colors border',
                    aspect === opt.value
                      ? 'bg-cyan-500 text-bg-950 border-cyan-300'
                      : 'bg-bg-700 text-ink-200 border-bg-600 hover:bg-bg-600',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-ink-500">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="w-32 accent-cyan-400"
              />
            </div>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="accent"
                onClick={applyCrop}
                disabled={!croppedAreaPixels || busy}
              >
                Auf Bild anwenden
              </Button>
            </div>
          </div>
          <div
            className="relative bg-bg-950 border border-bg-700 rounded-xl overflow-hidden"
            style={{ height: '60vh', minHeight: 360 }}
          >
            <Cropper
              image={currentUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              objectFit="contain"
            />
          </div>
        </div>
      )}

      {tab === 'paint' && (
        <PaintCanvas
          imageUrl={currentUrl}
          onCommit={blob => setNewUrlFromBlob(blob)}
          busy={busy}
        />
      )}

      {tab === 'pixelate' && (
        <PixelateCanvas
          imageUrl={currentUrl}
          onCommit={blob => setNewUrlFromBlob(blob)}
          busy={busy}
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-bg-700">
        <div className="text-xs text-ink-500">
          {dirty ? 'Änderungen vorhanden — speichern, um sie zu übernehmen.' : 'Original unverändert.'}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Original behalten
          </Button>
          <Button variant="primary" onClick={flattenAndSave} disabled={busy || !dirty}>
            {busy ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-9 px-4 rounded-lg text-sm font-bold transition-colors',
        active
          ? 'bg-violet-500 text-white border border-violet-400/40'
          : 'bg-transparent text-ink-300 hover:bg-bg-700 border border-transparent',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
