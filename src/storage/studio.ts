import type { Session } from '../exercise/engine'
import type { Reference } from '../library/reference'

export interface StudioStore {
  references(): Promise<Reference[]>
  saveReference(reference: Reference): Promise<void>
  removeReference(id: string): Promise<void>
  sessions(): Promise<Session[]>
  saveSession(session: Session): Promise<void>
}
const dbName = 'traceit-studio'
let connection: Promise<IDBDatabase> | undefined
function database() {
  if (connection) return connection
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('references', { keyPath: 'id' })
      request.result.createObjectStore('sessions', { keyPath: 'id' })
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
  saveSession: async (session) => {
    await transaction('sessions', 'readwrite', (store) => store.put(session))
  },
}
