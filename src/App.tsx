import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  HardDrive,
  History,
  Images,
  PanelsTopLeft,
  Repeat2,
  RotateCcw,
  X,
} from 'lucide-react'
import { type SurfaceHandle } from './drawing/Surface'
import {
  modeLabels,
  deskSnapshot,
  exerciseReducer,
  formatTime,
  isDrawing,
  newExercise,
  stageTime,
  toSession,
  type Exercise,
  type PracticeConfig,
  type Session,
} from './exercise/engine'
import { transferTime } from './exercise/Transfer'
import { collection } from './library/collection'
import type { Reference } from './library/reference'
import { currentStudy, downloadBackup } from './storage/backup'
import { DeskConflict, studioStore } from './storage/studio'
import { IconButton, Modal, ReferenceThumb } from './ui/components'
import { SessionHistory } from './ui/History'
import { Library } from './ui/Library'
import { PracticeSetup } from './ui/PracticeSetup'
import { ValueStudy } from './ui/ValueStudy'
import { Workspace } from './ui/Workspace'

type Page = 'workspace' | 'library' | 'history'
type Dialog =
  | { kind: 'setup'; ref: Reference }
  | { kind: 'review'; session: Session }
  | { kind: 'clear' | 'restart' | 'help' | 'done' }
  | null

export function App() {
  const [initial, setInitial] = useState<Exercise | null>()
  const [readError, setReadError] = useState(false)
  useEffect(() => {
    let live = true
    studioStore.readDesk().then(
      (draft) => {
        if (live) setInitial(draft)
      },
      () => {
        if (live) {
          setReadError(true)
          setInitial(null)
        }
      },
    )
    return () => {
      live = false
    }
  }, [])
  if (initial === undefined) return <p role="status">Opening your desk…</p>
  return <Studio initial={initial} readError={readError} />
}

interface DeskState {
  exercise: Exercise
  checkpoint: Exercise | null
}

function deskReducer(state: DeskState, action: Parameters<typeof exerciseReducer>[1]): DeskState {
  const exercise = exerciseReducer(state.exercise, action)
  if (exercise === state.exercise) return state
  // Starting the clock on mount must not claim the saved desk from another open tab.
  const checkpoint = action.type === 'clock' && action.run ? state.checkpoint : exercise
  return { exercise, checkpoint }
}

function Studio({ initial, readError }: { initial: Exercise | null; readError: boolean }) {
  const [page, setPage] = useState<Page>('workspace')
  const [{ exercise, checkpoint }, dispatch] = useReducer(deskReducer, initial, (draft) => ({
    exercise: draft ?? newExercise(collection[0], { mode: 'free', seconds: 60 }),
    checkpoint: null,
  }))
  const [dialog, setDialog] = useState<Dialog>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)
  const [saveState, setSaveState] = useState<'local' | 'saving' | 'saved' | 'error'>(
    initial ? 'saved' : 'local',
  )
  const [error, setError] = useState(readError ? 'Your browser could not read the saved desk.' : '')
  const [keepDesk, setKeepDesk] = useState(initial !== null)
  const [retry, setRetry] = useState(0)
  const [conflict, setConflict] = useState(false)
  const board = useRef<SurfaceHandle>(null)
  const from = useRef<DOMRect | null>(null)
  const hasWork =
    exercise.stage !== 'compare' && (keepDesk || exercise.stage !== 'trace' || exercise.trace.edits.length > 0)
  const stage = exercise.stage
  const advance = useCallback(() => {
    if (!isDrawing(stage)) return
    board.current?.finish()
    if (stage === 'trace' && exercise.config.mode !== 'value') from.current = board.current?.paperBox() ?? null
    dispatch({ type: 'advance', id: exercise.id, stage, now: performance.now(), completedAt: Date.now() })
  }, [stage, exercise.id, exercise.config.mode])
  useEffect(() => {
    const changed = () => {
      if (document.hidden) board.current?.finish()
      setVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  useEffect(() => {
    dispatch({
      type: 'clock',
      run: page === 'workspace' && dialog === null && !paused && visible && isDrawing(stage),
      now: performance.now(),
    })
  }, [page, dialog, paused, visible, stage, exercise.id])
  useEffect(() => {
    if (exercise.config.mode !== 'timed' || exercise.runningSince === null || !isDrawing(stage)) return
    const timeout = setTimeout(
      advance,
      Math.max(0, exercise.config.seconds * 1000 - stageTime(exercise, performance.now())),
    )
    return () => clearTimeout(timeout)
  }, [stage, exercise.config, exercise.elapsed, exercise.runningSince, advance])
  useEffect(() => {
    if (stage !== 'transfer') return
    const timeout = setTimeout(
      () => dispatch({ type: 'land', id: exercise.id }),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : transferTime + 20,
    )
    return () => clearTimeout(timeout)
  }, [stage, exercise.id])
  useLayoutEffect(() => {
    if (!checkpoint || (!hasWork && checkpoint.stage !== 'compare')) return
    let live = true
    setSaveState('saving')
    const save =
      checkpoint.stage === 'compare'
        ? studioStore.saveSession(toSession(checkpoint))
        : studioStore.saveDesk(deskSnapshot(checkpoint, performance.now()))
    save
      .then(() => {
        if (live) {
          setSaveState('saved')
          setError('')
        }
      })
      .catch((err) => {
        if (live) {
          reportSaveFailure(err)
        }
      })
    return () => {
      live = false
    }
  }, [checkpoint, hasWork, retry])

  function reportSaveFailure(err: unknown) {
    const changedElsewhere = err instanceof DeskConflict
    setConflict(changedElsewhere)
    setSaveState('error')
    setError(
      changedElsewhere
        ? 'Another tab changed the saved desk. Your drawings are still available in this tab.'
        : 'Your browser could not save the latest changes. Your drawings are still on the desk. Free some local storage and retry.',
    )
  }

  async function retrySave() {
    if (conflict) {
      if (!window.confirm('Replace the other tab’s saved desk with the study in this tab?')) return
      try {
        await studioStore.readDesk()
      } catch (err) {
        reportSaveFailure(err)
        return
      }
    }
    setRetry((n) => n + 1)
  }

  function navigate(next: Page) {
    board.current?.finish()
    setDialog(null)
    setPage(next)
    window.scrollTo(0, 0)
  }
  function configure(ref: Reference) {
    board.current?.finish()
    setDialog({ kind: 'setup', ref })
  }
  function start(ref: Reference, config: PracticeConfig) {
    setPaused(false)
    setError('')
    setSaveState('local')
    setKeepDesk(true)
    from.current = null
    dispatch({ type: 'start', reference: ref, config })
    navigate('workspace')
  }
  function openReview(session: Session) {
    board.current?.finish()
    setPaused(false)
    dispatch({ type: 'review', session })
    navigate('workspace')
  }
  async function complete() {
    board.current?.finish()
    try {
      await studioStore.saveSession(toSession(exercise))
      setError('')
      setSaveState('saved')
      setDialog({ kind: 'done' })
    } catch (err) {
      reportSaveFailure(err)
    }
  }
  function pause() {
    board.current?.finish()
    setPaused((v) => !v)
  }
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to workspace
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a
            href="#workspace"
            className="wordmark"
            aria-label="Traceit workspace"
            onClick={(e) => {
              e.preventDefault()
              navigate('workspace')
            }}
          >
            <img src="/mark.svg" alt="" />
            Traceit
          </a>
          <i className="brand-divider" />
          <nav className="main-nav" aria-label="Main navigation">
            {(
              [
                ['workspace', 'Workspace', PanelsTopLeft],
                ['library', 'Reference library', Images],
                ['history', 'Session history', History],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                aria-current={page === key ? 'page' : undefined}
                className={page === key ? 'active' : ''}
                onClick={() => navigate(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="header-end">
            <span className="local-indicator" role="status">
              <i className={'status-dot ' + (saveState === 'error' ? 'error-dot' : '')} />
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                  ? (stage === 'compare' ? 'Session saved' : 'Saved on this device')
                  : saveState === 'error'
                    ? 'Save failed'
                    : 'Local studio'}
            </span>
            <i className="divider" />
            <IconButton
              label="Practice guide and shortcuts"
              onClick={() => {
                board.current?.finish()
                setDialog({ kind: 'help' })
              }}
            >
              <CircleHelp size={19} />
            </IconButton>
          </div>
        </div>
      </header>
      <div id="content" tabIndex={-1}>
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            {saveState === 'error' && (
              <button className="button" onClick={() => void retrySave()}>
                {conflict ? 'Use this tab’s study' : 'Retry save'}
              </button>
            )}
            {saveState === 'error' && (
              <button className="button" onClick={() => {
                void downloadBackup(currentStudy(exercise)).catch(() => setError('The study download failed. Please try again.'))
              }}>Download this study</button>
            )}
            <IconButton label="Dismiss message" onClick={() => setError('')}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {page === 'workspace' && exercise.config.mode === 'value' && (
          <ValueStudy
            key={exercise.id}
            exercise={exercise}
            board={board}
            dispatch={dispatch}
            blocked={!!dialog || !visible}
            configure={() => configure(exercise.reference)}
            finish={advance}
            history={() => navigate('history')}
            library={() => navigate('library')}
          />
        )}
        {page === 'workspace' && exercise.config.mode !== 'value' && (
          <Workspace
            key={exercise.id}
            exercise={exercise}
            dispatch={dispatch}
            board={board}
            from={from.current}
            paused={paused}
            pause={pause}
            restart={() => setDialog({ kind: 'restart' })}
            advance={advance}
            comparisonSaved={saveState === 'saved'}
            complete={() => void complete()}
            configure={configure}
            library={() => navigate('library')}
            clear={() => setDialog({ kind: 'clear' })}
            blocked={!!dialog || !visible}
          />
        )}
        {page === 'library' && <Library select={configure} />}
        {page === 'history' && (
          <SessionHistory
            unsaved={saveState === 'error' || saveState === 'saving' ? exercise : undefined}
            open={(session) => (hasWork ? setDialog({ kind: 'review', session }) : openReview(session))}
            library={() => navigate('library')}
          />
        )}
      </div>
      {dialog?.kind === 'setup' && (
        <PracticeSetup
          reference={dialog.ref}
          initial={exercise.config}
          replacing={hasWork}
          onClose={() => setDialog(null)}
          start={(config) => start(dialog.ref, config)}
        />
      )}
      {dialog?.kind === 'clear' && (
        <Modal title="Clear this drawing?" onClose={() => setDialog(null)}>
          <p>Remove all marks from the current layer. You can bring them back with Undo.</p>
          <div className="modal-actions">
            <button className="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                dispatch({ type: 'clear' })
                setDialog(null)
              }}
            >
              Clear layer
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'restart' && (
        <Modal title="Restart this challenge?" onClose={() => setDialog(null)}>
          <p>
            Begin tracing {exercise.reference.title.toLowerCase()} again with a fresh timer and blank drawing
            layers.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="button primary" onClick={() => start(exercise.reference, exercise.config)}>
              <RotateCcw size={15} />
              Restart challenge
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'review' && (
        <Modal title={dialog.session.config.mode === 'value' ? 'Open saved value study?' : 'Open saved comparison?'} onClose={() => setDialog(null)}>
          <p>This replaces the unfinished exercise on your desk.</p>
          <div className="modal-actions">
            <button className="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="button primary" onClick={() => openReview(dialog.session)}>
              {dialog.session.config.mode === 'value' ? 'Open value study' : 'Open comparison'}
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'help' && (
        <Modal title="Practice guide" onClose={() => setDialog(null)}>
          {exercise.config.mode === 'value' ? (
            <p>
              Choose a paint value and block in the largest shapes beside the reference. Switch to 3 values
              to check your choices. Finish the study to keep it in session history.
            </p>
          ) : (
            <ol className="guide-steps">
              <li>
                <strong>Trace</strong> Draw over a reference to study its structure.
              </li>
              <li>
                <strong>Reconstruct</strong> Redraw it using your tracing as a guide.
              </li>
              <li>
                <strong>Compare</strong> Overlay the drawings and look for differences.
              </li>
            </ol>
          )}
          <h3 className="shortcuts-title">Desk shortcuts</h3>
          <dl className="shortcuts">
            {[
              ...(exercise.config.mode === 'value'
                ? [['Brush / Eraser', 'B / E']]
                : [['Pencil / Eraser / Pan', 'B / E / H'], ['Move reconstruction', 'V']]),
              ['Pan the sheet', 'Space + drag'],
              ['Zoom at the pointer', 'Scroll'],
              ['Undo', 'Ctrl / ⌘ + Z'],
              ['Redo', 'Ctrl / ⌘ + Shift + Z'],
            ].map(([label, key]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="device-note">
            <HardDrive size={15} />
            Your unfinished study, uploads, and completed sessions are saved in this browser.
          </p>
        </Modal>
      )}
      {dialog?.kind === 'done' && (
        <Modal title="Session complete" onClose={() => setDialog(null)}>
          <div className="saved-message">
            <Check size={16} />
            Saved to session history
          </div>
          <div className="setup-reference">
            <ReferenceThumb item={exercise.reference} />
            <div>
              <small>{modeLabels[exercise.config.mode]}</small>
              <h3>{exercise.reference.title}</h3>
            </div>
          </div>
          <div className="duration-summary">
            <div>
              <span>Tracing time</span>
              <strong>{formatTime(exercise.elapsed.trace / 1000)}</strong>
            </div>
            <div>
              <span>Reconstruction time</span>
              <strong>{formatTime(exercise.elapsed.reconstruct / 1000)}</strong>
            </div>
          </div>
          <div className="done-actions">
            <button className="button primary" onClick={() => configure(exercise.reference)}>
              <Repeat2 size={16} />
              Repeat this reference
            </button>
            <button className="button" onClick={() => navigate('library')}>
              <BookOpen size={16} />
              Choose another reference
            </button>
            <button className="text-button" onClick={() => navigate('history')}>
              View session history <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
