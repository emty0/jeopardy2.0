import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'

type ResizeHeight = 1080 | 720 | 480 | null

interface Props {
  initialUrl: string
  onSaved: (newUrl: string, newType: 'video' | 'audio') => void
  onCancel: () => void
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}

export function VideoEditor({ initialUrl, onSaved, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [start, setStart] = useState<number>(0)
  const [end, setEnd] = useState<number>(0)
  const [resize, setResize] = useState<ResizeHeight>(null)
  const [audioOnly, setAudioOnly] = useState<boolean>(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onLoadedMetadata() {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    setStart(0)
    setEnd(v.duration)
  }

  // Während des Abspielens: bei Erreichen des End-Markers pausieren und dorthin setzen.
  // Beim Play vor dem Start-Marker oder nach dem Ende: zurück auf Start springen.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTimeUpdate = () => {
      if (!v.paused && v.currentTime >= end) {
        v.pause()
        v.currentTime = end
      }
    }
    const onPlay = () => {
      if (v.currentTime < start || v.currentTime >= end) {
        v.currentTime = start
      }
    }
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('play', onPlay)
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('play', onPlay)
    }
  }, [start, end])

  function seekStart() {
    const v = videoRef.current
    if (v) v.currentTime = start
  }

  function seekEnd() {
    const v = videoRef.current
    if (v) v.currentTime = end
  }

  const trimChanged = start > 0 || end < duration - 0.05
  const dirty = trimChanged || resize !== null || audioOnly

  async function save() {
    if (!dirty) return
    setError(null)
    setBusy(true)
    try {
      const body = {
        url: initialUrl,
        trim: trimChanged ? { start, end } : null,
        resizeHeight: audioOnly ? null : resize,
        extractAudio: audioOnly,
      }
      const res = await fetch('/api/media/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { message?: string }).message ?? 'Verarbeitung fehlgeschlagen')
      }
      const json = (await res.json()) as { url: string; type: 'video' | 'audio' }
      onSaved(json.url, json.type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verarbeitung fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (audioOnly) setResize(null)
  }, [audioOnly])

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="bg-bg-950 border border-bg-700 rounded-xl overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          src={initialUrl}
          onLoadedMetadata={onLoadedMetadata}
          controls
          className="max-h-[50vh] w-full"
        />
      </div>

      <div className="flex flex-col gap-3 px-4 py-3 bg-bg-800/50 border border-bg-700 rounded-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wider text-ink-300">
            Trimmen
          </span>
          <span className="text-xs text-ink-500 tabular-nums">
            Dauer: {formatTime(end - start)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-ink-500 w-12">Start</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={start}
            onChange={e => {
              const v = Math.min(Number(e.target.value), end - 0.1)
              setStart(v)
              if (videoRef.current) videoRef.current.currentTime = v
            }}
            disabled={duration === 0 || busy}
            className="flex-1 accent-cyan-400"
          />
          <span className="text-sm tabular-nums text-ink-200 w-16 text-right">{formatTime(start)}</span>
          <Button size="sm" variant="ghost" onClick={seekStart} disabled={duration === 0 || busy}>
            Anspringen
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-ink-500 w-12">Ende</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={end}
            onChange={e => {
              const v = Math.max(Number(e.target.value), start + 0.1)
              setEnd(v)
              if (videoRef.current) videoRef.current.currentTime = v
            }}
            disabled={duration === 0 || busy}
            className="flex-1 accent-cyan-400"
          />
          <span className="text-sm tabular-nums text-ink-200 w-16 text-right">{formatTime(end)}</span>
          <Button size="sm" variant="ghost" onClick={seekEnd} disabled={duration === 0 || busy}>
            Anspringen
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-3 bg-bg-800/50 border border-bg-700 rounded-xl">
        <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
          <span className="text-sm font-bold uppercase tracking-wider text-ink-300">Auflösung</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: 'Original', value: null },
                { label: '1080p', value: 1080 },
                { label: '720p', value: 720 },
                { label: '480p', value: 480 },
              ] as const
            ).map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setResize(opt.value)}
                disabled={audioOnly || busy}
                className={[
                  'h-9 px-4 rounded-lg text-xs font-bold transition-colors border disabled:opacity-40',
                  resize === opt.value
                    ? 'bg-cyan-500 text-bg-950 border-cyan-300'
                    : 'bg-bg-700 text-ink-200 border-bg-600 hover:bg-bg-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[200px]">
          <span className="text-sm font-bold uppercase tracking-wider text-ink-300">Modus</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={audioOnly}
              onChange={e => setAudioOnly(e.target.checked)}
              disabled={busy}
              className="w-4 h-4 accent-cyan-400"
            />
            <span className="text-sm text-ink-200">Nur Audio extrahieren (.mp3)</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-bad/20 border border-bad/40 text-bad rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-bg-700">
        <div className="text-xs text-ink-500">
          {dirty ? 'Server verarbeitet das Video beim Speichern.' : 'Keine Änderungen.'}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Original behalten
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Verarbeite…' : 'Speichern'}
          </Button>
        </div>
      </div>
    </div>
  )
}
