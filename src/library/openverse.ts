import { readImage } from './images'
import type { Reference } from './reference'

export interface Discovery {
  id: string
  title: string
  creator: string
  license: string
  license_version: string
  license_url: string
  foreign_landing_url: string
  thumbnail: string
  url: string
}
export function httpUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
export async function searchImages(
  query: string,
  subject: string,
  signal: AbortSignal,
): Promise<Discovery[]> {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.search = new URLSearchParams({
    q: [query.trim(), subject].filter(Boolean).join(' ') || 'still life',
    page_size: '18',
    mature: 'false',
    license: 'cc0,pdm,by,by-sa',
  }).toString()
  const response = await fetch(url, { signal, credentials: 'omit' })
  if (!response.ok) throw new Error('Image search is unavailable (' + response.status + ').')
  const data = (await response.json()) as { results: Discovery[] }
  return data.results
}
export function licenseName(result: Discovery) {
  return (
    (result.license.toLowerCase() === 'pdm'
      ? 'Public domain'
      : result.license.toLowerCase() === 'cc0'
        ? 'CC0'
        : 'CC ' + result.license.toUpperCase()) +
    ' ' +
    (result.license_version || '')
  )
}
export async function importDiscovery(item: Discovery, signal: AbortSignal): Promise<Reference> {
  for (const source of new Set([item.url, item.thumbnail])) {
    if (!httpUrl(source)) continue
    try {
      const response = await fetch(source, { mode: 'cors', credentials: 'omit', signal })
      if (!response.ok) continue
      const image = await readImage(await response.blob())
      return {
        ...image,
        id: 'openverse/' + item.id,
        title: item.title || 'Untitled study',
        subject: 'Openverse image',
        source: 'openverse',
        creator: item.creator || 'Creator unlisted',
        license: licenseName(item),
        sourceUrl: httpUrl(item.foreign_landing_url),
        licenseUrl: httpUrl(item.license_url),
      }
    } catch (error) {
      if (signal.aborted) throw error
    }
  }
  throw new Error(
    'The image host could not supply a readable copy. Choose another reference or upload a licensed copy.',
  )
}
