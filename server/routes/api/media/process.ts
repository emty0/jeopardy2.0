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

type ProcessBody = {
  url: string
  trim?: { start: number; end: number } | null
  resizeHeight?: 1080 | 720 | 480 | null
  extractAudio?: boolean
}

const ALLOWED_HEIGHTS = new Set([1080, 720, 480])

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

  const extractAudio = !!body.extractAudio
  const ext = extractAudio ? '.mp3' : extname(basename(inputPath)) || '.mp4'
  const outFilename = `${nanoid(12)}${ext}`
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
    if (extractAudio) {
      cmd = cmd.noVideo().audioCodec('libmp3lame').audioBitrate('192k').format('mp3')
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

  return { url: `/uploads/${outFilename}`, type: extractAudio ? 'audio' : 'video' }
})
