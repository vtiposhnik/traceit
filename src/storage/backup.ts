import { z } from 'zod'
import { deskSnapshot, toSession, type Exercise, type Session } from '../exercise/engine'
import type { Reference } from '../library/reference'

export interface StudioBackup {
  references: Reference[]
  sessions: Session[]
  desk: Exercise | null
}

export function currentStudy(exercise: Exercise): StudioBackup {
  return exercise.stage === 'compare'
    ? { references: [], sessions: [toSession(exercise)], desk: null }
    : { references: [], sessions: [], desk: deskSnapshot(exercise, performance.now()) }
}

const id = z.string().min(1)
const duration = z.number().nonnegative()
const times = z.object({ trace: duration, reconstruct: duration })
const percent = z.number().min(0).max(100)
const creditUrl = z.url({ protocol: /^https?$/ }).optional()
const reference = z.object({
  id, title: z.string(), subject: z.string(), source: z.enum(['studio', 'upload', 'openverse']),
  width: z.int().positive(), height: z.int().positive(), creator: z.string(), license: z.string(),
  sourceUrl: creditUrl, licenseUrl: creditUrl, note: z.string().optional(), image: z.int().nonnegative(),
})
const stroke = z.object({
  tool: z.enum(['pencil', 'eraser', 'clear']), size: z.number().nonnegative(), simulatePressure: z.boolean(),
  points: z.array(z.tuple([z.number(), z.number(), z.number().min(0).max(1)])),
})
const history = z.object({ edits: z.array(stroke), cursor: z.int().nonnegative() })
  .refine((h) => h.cursor <= h.edits.length)
const study = z.object({
  id, retryOf: id.optional(), reference, config: z.object({ mode: z.enum(['free', 'timed']), seconds: z.int().min(1).max(3600) }),
  elapsed: times, drawingTime: times,
  comparison: z.object({
    offset: z.object({ x: z.number(), y: z.number() }), traceVisible: z.boolean(),
    reconstructionVisible: z.boolean(), originalVisible: z.boolean(), traceOpacity: percent,
    reconstructionOpacity: percent, separate: z.boolean(), linkedViews: z.boolean().default(true),
    reconstructionScale: z.number().min(25).max(400).default(100),
  }),
})
const archive = z.object({
  format: z.literal('traceit-studio'), version: z.literal(1), images: z.array(z.string()),
  references: z.array(reference),
  sessions: z.array(study.extend({ completedAt: z.number(), trace: z.array(stroke), reconstruct: z.array(stroke) })),
  desk: study.extend({
    stage: z.enum(['trace', 'reconstruct']), runningSince: z.null(), completedAt: z.null(),
    trace: history, reconstruct: history,
  }).nullable(),
})

async function referenceData(ref: Reference): Promise<string> {
  let blob = ref.blob
  if (!blob) {
    if (!ref.url?.startsWith('/studies/')) throw new Error('The reference image is missing.')
    const response = await fetch(ref.url)
    if (!response.ok) throw new Error('Could not read the bundled reference image.')
    blob = await response.blob()
  }
  const reader = new FileReader()
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function downloadBackup(data: StudioBackup) {
  const images = new Map<string, number>()
  async function pack(ref: Reference) {
    const { blob, url, ...metadata } = ref
    const encoded = await referenceData(ref)
    const image = images.get(encoded) ?? images.size
    images.set(encoded, image)
    return { ...metadata, image }
  }
  const references = await Promise.all(data.references.map(pack))
  const sessions = await Promise.all(data.sessions.map(async (s) => ({ ...s, reference: await pack(s.reference) })))
  const desk = data.desk && { ...data.desk, reference: await pack(data.desk.reference) }
  const json = JSON.stringify({ format: 'traceit-studio', version: 1, images: [...images.keys()], references, sessions, desk })
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'traceit-' + new Date().toISOString().replace(/:/g, '-') + '.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export async function parseBackup(file: File): Promise<StudioBackup> {
  const data = archive.parse(JSON.parse(await file.text()))
  const images = await Promise.all(data.images.map(async (encoded) => {
    if (!/^data:image\/(webp|png|jpeg);base64,/.test(encoded)) throw new Error('Unsupported image.')
    const blob = await (await fetch(encoded)).blob()
    const bitmap = await createImageBitmap(blob)
    const image = { blob, width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return image
  }))
  function unpack({ image, ...ref }: z.infer<typeof reference>): Reference {
    const asset = images[image]
    if (!asset || asset.width !== ref.width || asset.height !== ref.height) throw new Error('Invalid reference image.')
    return { ...ref, blob: asset.blob }
  }
  const sessions = data.sessions.map((s) => ({ ...s, reference: unpack(s.reference) }))
  const references = data.references.map(unpack)
  const desk = data.desk && { ...data.desk, reference: unpack(data.desk.reference) }
  if (new Set(sessions.map((s) => s.id)).size !== sessions.length ||
      new Set(references.map((r) => r.id)).size !== references.length ||
      sessions.some((s) => s.id === desk?.id)) throw new Error('Duplicate records in backup.')
  return { references, sessions, desk }
}
