import { useRef, useState } from 'react'
import type { Exercise } from '../exercise/engine'
import { currentStudy, downloadBackup, parseBackup, type StudioBackup } from '../storage/backup'
import { DeskConflict, studioStore } from '../storage/studio'
import { Modal } from './components'

export function BackupDialog({ close, unsaved }: { close: () => void; unsaved?: Exercise }) {
  const input = useRef<HTMLInputElement>(null)
  const [incoming, setIncoming] = useState<StudioBackup | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function download() {
    setBusy(true)
    try {
      const data = await studioStore.backup()
      if (unsaved) {
        const current = currentStudy(unsaved)
        data.sessions = [...data.sessions.filter((s) => s.id !== unsaved.id), ...current.sessions]
        if (current.desk || data.desk?.id === unsaved.id) data.desk = current.desk
      }
      await downloadBackup(data)
      setMessage('Backup download started.')
    } catch {
      setMessage('Could not download the backup. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function choose(file: File) {
    setBusy(true)
    setMessage('')
    try {
      setIncoming(await parseBackup(file))
    } catch {
      setMessage('This file could not be opened as a Traceit backup. Check the file and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    if (!incoming) return
    setBusy(true)
    try {
      await studioStore.restore(incoming)
      window.location.reload()
    } catch (err) {
      setMessage(err instanceof DeskConflict
        ? 'Another tab changed the desk. Reopen Traceit before restoring this backup.'
        : 'Restore failed. Check available browser storage and try again.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Studio backup" onClose={() => { if (!busy) close() }}>
      {incoming ? (
        <>
          <p>Restore {incoming.sessions.length} completed studies and {incoming.references.length} library references?</p>
          <p>Matching saved records will be updated. {incoming.desk
            ? 'The unfinished study in this file will replace the current desk.'
            : 'If this backup completes the current study, it will move to history.'} Restoring reopens the studio.</p>
          {unsaved && <p>Download your unsaved work before restoring.</p>}
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={() => setIncoming(null)}>Cancel</button>
            <button className="button primary" disabled={busy} onClick={restore}>Restore studies</button>
          </div>
        </>
      ) : (
        <>
          <p>Download your unfinished study, session history, and reference images in one editable backup.</p>
          <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Backup file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void choose(file)
            }}
          />
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={() => input.current?.click()}>Restore backup</button>
            <button className="button primary" disabled={busy} onClick={download}>Download backup</button>
          </div>
        </>
      )}
      {(message || busy) && <p role="status">{busy ? 'Working…' : message}</p>}
    </Modal>
  )
}
