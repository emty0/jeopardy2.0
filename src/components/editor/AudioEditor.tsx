import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'

interface Props {
  initialUrl: string
  onSaved: (newUrl: string, newType: 'audio') => void
  onCancel: () => void
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}

export function AudioEditor({ initialUrl, onSaved, onCancel }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState<number>(0)
  const [start, setStart] = useState<number>(0)
  const [end, setEnd] = useState<number>(0)
  const [pitchSemitones, setPitchSemitones] = useState<number>(0)
  const [speed, setSpeed] = useState<number>(1)
  const [reverse, setReverse] = useState<boolean>(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onLoadedMetadata() {
    const a = audioRef.current
    if (!a) return
    setDuration(a.duration)
    setStart(0)
    setEnd(a.duration)
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTimeUpdate = () => {
      if (!a.paused && a.currentTime >= end) {
        a.pause()
        a.currentTime = end
      }
    }
    const onPlay = () => {
      if (a.currentTime < start || a.currentTime >= end) {
        a.currentTime = start
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('play', onPlay)
    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('play', onPlay)
    }
  }, [start, end])

  function seekStart() {
    const a = audioRef.current
    if (a) a.currentTime = start
  }
  function seekEnd() {
    const a = audioRef.current
    if (a) a.currentTime = end
  }

  const trimChanged = start > 0 || end < duration - 0.05
  const fxChanged = pitchSemitones !== 0 || Math.abs(speed - 1) > 0.001 || reverse
  const dirty = trimChanged || fxChanged

  function resetFx() {
    setPitchSemitones(0)
    setSpeed(1)
    setReverse(false)
  }

  async function save() {
    if (!dirty) return
    setError(null)
    setBusy(true)
    try {
      const body = {
        url: initialUrl,
        trim: trimChanged ? { start, end } : null,
        audioFx: fxChanged ? { reverse, pitchSemitones, speed } : null,
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
      const json = (await res.json()) as { url: string; type: 'audio' }
      onSaved(json.url, json.type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verarbeitung fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const pitchLabel =
    pitchSemitones === 0
      ? 'unverändert'
      : `${pitchSemitones > 0 ? '+' : ''}${pitchSemitones} Halbton${Math.abs(pitchSemitones) === 1 ? '' : 'e'}`
  const speedLabel = `${speed.toFixed(2).replace(/\.?0+$/, '')}×`

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="bg-bg-950 border border-bg-700 rounded-xl p-4 flex items-center justify-center">
        <audio
          ref={audioRef}
          src={initialUrl}
          onLoadedMetadata={onLoadedMetadata}
          controls
          className="w-full max-w-xl"
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
              if (audioRef.current) audioRef.current.currentTime = v
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
              if (audioRef.current) audioRef.current.currentTime = v
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

      <div className="flex flex-col gap-3 px-4 py-3 bg-bg-800/50 border border-bg-700 rounded-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wider text-ink-300">Effekte</span>
          <Button size="sm" variant="ghost" onClick={resetFx} disabled={busy || !fxChanged}>
            Zurücksetzen
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-ink-500 w-24">Tonhöhe</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={pitchSemitones}
            onChange={e => setPitchSemitones(Number(e.target.value))}
            disabled={busy}
            className="flex-1 accent-violet-400"
          />
          <span className="text-sm tabular-nums text-ink-200 w-32 text-right">{pitchLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-ink-500 w-24">Geschw.</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            disabled={busy}
            className="flex-1 accent-violet-400"
          />
          <span className="text-sm tabular-nums text-ink-200 w-32 text-right">{speedLabel}</span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={reverse}
            onChange={e => setReverse(e.target.checked)}
            disabled={busy}
            className="w-4 h-4 accent-violet-400"
          />
          <span className="text-sm text-ink-200">Rückwärts abspielen</span>
        </label>
      </div>

      {error && (
        <div className="px-4 py-3 bg-bad/20 border border-bad/40 text-bad rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-bg-700">
        <div className="text-xs text-ink-500">
          {dirty ? 'Server verarbeitet das Audio beim Speichern.' : 'Keine Änderungen.'}
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
