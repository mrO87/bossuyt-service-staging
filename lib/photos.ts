export interface CompressedPhotoResult {
  blob: Blob
  fileName: string
  mimeType: 'image/jpeg'
  originalSize: number
  compressedSize: number
  width: number
  height: number
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.72

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Kon afbeelding niet laden: ${file.name}`))
    }

    image.src = url
  })
}

function getTargetSize(width: number, height: number) {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height }
  }

  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Kon gecomprimeerde afbeelding niet maken'))
        return
      }

      resolve(blob)
    }, 'image/jpeg', JPEG_QUALITY)
  })
}

function toJpegFileName(originalName: string) {
  const stripped = originalName.replace(/\.[^.]+$/, '').trim()
  const base = stripped || `foto-${Date.now()}`
  return `${base}.jpg`
}

export async function compressPhotoFile(file: File): Promise<CompressedPhotoResult> {
  const image = await loadImageFromFile(file)
  const target = getTargetSize(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context niet beschikbaar')
  }

  context.drawImage(image, 0, 0, target.width, target.height)

  const blob = await canvasToJpegBlob(canvas)

  return {
    blob,
    fileName: toJpegFileName(file.name),
    mimeType: 'image/jpeg',
    originalSize: file.size,
    compressedSize: blob.size,
    width: target.width,
    height: target.height,
  }
}
