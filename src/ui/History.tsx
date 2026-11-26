import { useEffect, useState } from 'react'
import { ArrowRight, History as HistoryIcon } from 'lucide-react'
import { modeLabels, formatTime, type Exercise, type Session } from '../exercise/engine'
import { studioStore } from '../storage/studio'
import { BackupDialog } from './StudioBackup'
import { ReferenceThumb } from './components'

export function SessionHistory({ open, library, unsaved }: {
  open: (s: Session) => void
  library: () => void
  unsaved?: Exercise
}) {
  const [backupOpen, setBackupOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    studioStore
      .sessions()
      .then((s) => {
        if (live) setSessions(s)
      })
      .catch(() => {
        if (live) setError(true)
      })
    return () => {
      live = false
    }
  }, [])
  return (
    <main className="page history-page">
      <div className="page-heading">
        <div>
          <h1>Session history</h1>
          <p>Reopen a completed exercise to review your drawings.</p>
        </div>
        <button className="button" onClick={() => setBackupOpen(true)}>Studio backup</button>
      </div>
      {backupOpen && <BackupDialog unsaved={unsaved} close={() => setBackupOpen(false)} />}
      {error ? (
        <p className="error-message" role="alert">
          Your browser could not read saved sessions.
        </p>
      ) : sessions === null ? (
        <p role="status">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <HistoryIcon size={34} />
          <h2>Your practice starts at the desk</h2>
          <p>Completed comparisons will appear here, saved on this device.</p>
          <button className="button" onClick={library}>
            Choose a reference <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="history-list">
          {sessions.map((s) => (
            <article key={s.id} className="history-entry">
              <ReferenceThumb item={s.reference} />
              <div className="history-name">
                <small>
                  {new Date(s.completedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </small>
                <h2>{s.reference.title}</h2>
                <p>
                  {s.retryOf && 'Reconstruction retry · '}
                  {modeLabels[s.config.mode]} ·{' '}
                  {formatTime((s.elapsed.trace + s.elapsed.reconstruct) / 1000)} total
                </p>
              </div>
              <button className="button" onClick={() => open(s)}>
                {s.config.mode === 'value' ? 'Open value study' : 'Open comparison'} <ArrowRight size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
