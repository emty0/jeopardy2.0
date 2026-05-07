import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { nanoid } from 'nanoid'

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3',
  'video/mp4', 'video/webm', 'video/ogg',
])

const MAX_SIZE = 200 * 1024 * 1024 // 200 MB

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form) throw createError({ statusCode: 400, message: 'Keine Datei gefunden.' })

  const file = form.find(f => f.name === 'file')
  if (!file?.data) throw createError({ statusCode: 400, message: 'Feld "file" fehlt.' })

  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 413, message: 'Datei zu groß (max. 200 MB).' })
  }

  const mime = file.type ?? 'application/octet-stream'
  if (!ALLOWED_TYPES.has(mime)) {
    throw createError({ statusCode: 415, message: 'Dateityp nicht erlaubt.' })
  }

  const ext = extname(file.filename ?? '') || (mime.startsWith('image/') ? '.jpg' : mime.startsWith('audio/') ? '.mp3' : '.mp4')
  const filename = `${nanoid(12)}${ext}`
  const uploadsDir = join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  await writeFile(join(uploadsDir, filename), file.data)

  return { url: `/uploads/${filename}` }
})
