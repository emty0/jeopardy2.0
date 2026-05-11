import { defineEventHandler, readBody, createError } from 'h3'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { nanoid } from 'nanoid'
import ffmpegStaticPath from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'

if (ffmpegStaticPath) {
  ffmpeg.setFfmpegPath(ffmpegStaticPath as unknown as string)
}

type AudioFx = {
  reverse?: boolean
  pitchSemitones?: number
  speed?: number
}

type ProcessBody = {
  url: string
  trim?: { start: number; end: number } | null
  resizeHeight?: 1080 | 720 | 480 | null
  extractAudio?: boolean
  audioFx?: AudioFx | null
}

const ALLOWED_HEIGHTS = new Set([1080, 720, 480])

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'])

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function chainAtempo(speed: number): string[] {
  const filters: string[] = []
  let s = clamp(speed, 0.25, 4)
  while (s < 0.5) {
    filters.push('atempo=0.5')
    s /= 0.5
  }
  while (s > 2.0) {
    filters.push('atempo=2.0')
    s /= 2.0
  }
  if (Math.abs(s - 1) > 1e-3) {
    filters.push(`atempo=${s.toFixed(4)}`)
  }
  return filters
}

function buildAudioFilter(fx: AudioFx | null | undefined): string | null {
  if (!fx) return null
  const semitones = clamp(fx.pitchSemitones ?? 0, -12, 12)
  const speed = clamp(fx.speed ?? 1, 0.25, 4)
  const reverse = !!fx.reverse
  const parts: string[] = []
  const SR = 44100
  if (Math.abs(semitones) > 1e-6) {
    const p = Math.pow(2, semitones / 12)
    parts.push(`asetrate=${Math.round(SR * p)}`)
    parts.push(`aresample=${SR}`)
    parts.push(...chainAtempo(1 / p))
  }
  if (Math.abs(speed - 1) > 1e-3) {
    parts.push(...chainAtempo(speed))
  }
  if (reverse) {
    parts.push('areverse')
  }
  return parts.length > 0 ? parts.join(',') : null
}

export default defineEventHandler(async event => {
  const body = (await readBody(event)) as ProcessBody | null
  if (!body || typeof body.url !== 'string') {
    throw createError({ statusCode: 400, message: 'Ungültiger Request-Body.' })
  }

  if (!body.url.startsWith('/uploads/')) {
    throw createError({ statusCode: 400, message: 'URL muss in /uploads/ liegen.' })
  }

  const inputPath = join(process.cwd(), 'public', body.url.replace(/^\//, ''))
  if (!existsSync(inputPath)) {
    throw createError({ statusCode: 404, message: 'Quelldatei nicht gefunden.' })
  }

  if (!ffmpegStaticPath) {
    throw createError({ statusCode: 500, message: 'FFmpeg-Binary nicht gefunden.' })
  }

  const uploadsDir = join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadsDir, { recursive: true })

  const inputExt = (extname(basename(inputPath)) || '').toLowerCase()
  const isAudioInput = AUDIO_EXTS.has(inputExt)
  const audioFilter = buildAudioFilter(body.audioFx)
  const audioMode = !!body.extractAudio || isAudioInput || !!audioFilter
  const outExt = audioMode ? '.mp3' : (inputExt || '.mp4')
  const outFilename = `${nanoid(12)}${outExt}`
  const outPath = join(uploadsDir, outFilename)

  const trim = body.trim
  if (trim && (typeof trim.start !== 'number' || typeof trim.end !== 'number' || trim.end <= trim.start)) {
    throw createError({ statusCode: 400, message: 'Ungültiges Trim-Intervall.' })
  }
  const resizeHeight = body.resizeHeight ?? null
  if (resizeHeight !== null && !ALLOWED_HEIGHTS.has(resizeHeight)) {
    throw createError({ statusCode: 400, message: 'Ungültige Auflösung.' })
  }

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
    if (trim) {
      cmd = cmd.setStartTime(trim.start).setDuration(trim.end - trim.start)
    }
    if (audioMode) {
      cmd = cmd.noVideo().audioCodec('libmp3lame').audioBitrate('192k').format('mp3')
      if (audioFilter) {
        cmd = cmd.audioFilters(audioFilter)
      }
    } else {
      const outputOptions = ['-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart']
      if (resizeHeight) {
        outputOptions.push('-vf', `scale=-2:${resizeHeight}`)
      }
      cmd = cmd.videoCodec('libx264').outputOptions(outputOptions).audioCodec('aac')
    }
    cmd
      .on('end', () => resolve())
      .on('error', err => reject(err))
      .save(outPath)
  })

  return { url: `/uploads/${outFilename}`, type: audioMode ? 'audio' : 'video' }
})
