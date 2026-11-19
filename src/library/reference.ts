export type ReferenceSource = 'studio' | 'upload' | 'openverse'

export interface Reference {
  id: string
  title: string
  subject: string
  source: ReferenceSource
  width: number
  height: number
  url?: string
  blob?: Blob
  creator: string
  license: string
  sourceUrl?: string
  licenseUrl?: string
  note?: string
}

export const sourceNames: Record<ReferenceSource, string> = {
  studio: 'Studio collection',
  upload: 'My library',
  openverse: 'Openverse',
}
