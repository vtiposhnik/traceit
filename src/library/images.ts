import { useEffect, useState } from 'react'
import type { Reference } from './reference'

export function useImageUrl(reference: Reference) {
  const [local, setLocal] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!reference.blob) return
    const url = URL.createObjectURL(reference.blob)
    setLocal({ blob: reference.blob, url })
    return () => URL.revokeObjectURL(url)
  }, [reference.blob])
  return reference.blob ? (reference.blob === local?.blob ? local.url : undefined) : reference.url
}

export async function readImage(blob: Blob): Promise<Pick<Reference, 'blob' | 'width' | 'height'>> {
  if (blob.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.')
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0, width, height)
    const local = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92))
    if (!local) throw new Error('Image conversion failed')
    return { blob: local, width, height }
  } catch {
    throw new Error('This image could not be opened. Try a JPEG, PNG, or WebP file.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
