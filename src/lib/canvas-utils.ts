export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${src}`))
    img.src = src
  })
}

export function pixelateRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  blockSize = 12,
) {
  if (w <= 0 || h <= 0) return
  const ix = Math.max(0, Math.floor(x))
  const iy = Math.max(0, Math.floor(y))
  const iw = Math.floor(Math.min(w, ctx.canvas.width - ix))
  const ih = Math.floor(Math.min(h, ctx.canvas.height - iy))
  if (iw <= 0 || ih <= 0) return

  const img = ctx.getImageData(ix, iy, iw, ih)
  const d = img.data
  for (let by = 0; by < ih; by += blockSize) {
    for (let bx = 0; bx < iw; bx += blockSize) {
      const bw = Math.min(blockSize, iw - bx)
      const bh = Math.min(blockSize, ih - by)
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
          const i = ((by + yy) * iw + (bx + xx)) * 4
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
          a += d[i + 3]
          n++
        }
      }
      r = Math.round(r / n)
      g = Math.round(g / n)
      b = Math.round(b / n)
      a = Math.round(a / n)
      for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
          const i = ((by + yy) * iw + (bx + xx)) * 4
          d[i] = r
          d[i + 1] = g
          d[i + 2] = b
          d[i + 3] = a
        }
      }
    }
  }
  ctx.putImageData(img, ix, iy)
}

export type CropArea = { x: number; y: number; width: number; height: number }

export async function getCroppedBlob(
  image: HTMLImageElement,
  area: CropArea,
  mime = 'image/png',
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width))
  canvas.height = Math.max(1, Math.round(area.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvasToBlob(canvas, mime, quality)
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime = 'image/png',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) reject(new Error('Canvas zu Blob fehlgeschlagen'))
        else resolve(blob)
      },
      mime,
      quality,
    )
  })
}

export async function uploadBlob(blob: Blob, filename: string): Promise<string> {
  const form = new FormData()
  form.append('file', new File([blob], filename, { type: blob.type }))
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error((e as { message?: string }).message ?? 'Upload fehlgeschlagen')
  }
  const json = (await res.json()) as { url: string }
  return json.url
}
