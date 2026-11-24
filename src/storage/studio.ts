import type { Exercise, Session } from '../exercise/engine'
import type { Reference } from '../library/reference'

export interface StudioStore {
  references(): Promise<Reference[]>
  saveReference(reference: Reference): Promise<void>
  removeReference(id: string): Promise<void>
  sessions(): Promise<Session[]>
  readDesk(): Promise<Exercise | null>
  saveDesk(exercise: Exercise): Promise<void>
  saveSession(session: Session): Promise<void>
}
const dbName = 'traceit-studio'
let connection: Promise<IDBDatabase> | undefined
function database() {
  if (connection) return connection
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('references')) db.createObjectStore('references', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' })
      db.createObjectStore('desk')
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        connection = undefined
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch((err) => {
    connection = undefined
    throw err
  })
  return connection
}
async function transaction<T>(
  table: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(table, mode)
    const request = operation(tx.objectStore(table))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Local storage is unavailable.'))
    tx.onerror = () => reject(tx.error ?? request.error)
  })
}
interface DeskRecord {
  revision: number
  exercise: Exercise | null
}

export class DeskConflict extends Error {}
let revision = 0
let pending = Promise.resolve()

// Queue writes in user-action order. Commit the finished session and retire its draft together.
function writeDesk(exercise: Exercise | null, session?: Session) {
  const write = pending.then(async () => {
    const db = await database()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(session ? ['desk', 'sessions'] : ['desk'], 'readwrite')
      const desk = tx.objectStore('desk')
      const current = desk.get('active')
      let failure: unknown
      current.onsuccess = () => {
        try {
          const record: DeskRecord | undefined = current.result
          if ((record?.revision ?? 0) !== revision) throw new DeskConflict()
          if (session) tx.objectStore('sessions').put(session)
          desk.put({ revision: revision + 1, exercise }, 'active')
        } catch (err) {
          failure = err
          tx.abort()
        }
      }
      tx.oncomplete = () => {
        revision++
        resolve()
      }
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Local save failed.'))
    })
  })
  pending = write.catch(() => {})
  return write
}

export const studioStore: StudioStore = {
  references: () => transaction('references', 'readonly', (store) => store.getAll()),
  saveReference: async (ref) => {
    await transaction('references', 'readwrite', (store) => store.put(ref))
  },
  removeReference: async (id) => {
    await transaction('references', 'readwrite', (store) => store.delete(id))
  },
  sessions: async () =>
    (await transaction<Session[]>('sessions', 'readonly', (store) => store.getAll())).sort(
      (a, b) => b.completedAt - a.completedAt,
    ),
  readDesk: async () => {
    const record = await transaction<DeskRecord | undefined>('desk', 'readonly', (store) => store.get('active'))
    revision = record?.revision ?? 0
    return record?.exercise ?? null
  },
  saveDesk: (exercise) => writeDesk(exercise),
  saveSession: (session) => writeDesk(null, session),
}
