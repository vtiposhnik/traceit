import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject } from 'react'
import { Brush, Eraser, Maximize, Redo2, Undo2 } from 'lucide-react'
import { Surface, type SurfaceHandle } from '../drawing/Surface'
import { valueColor, valueLevels, visibleStrokes, type PaintValue } from '../drawing/model'
import { exerciseReducer, type Exercise } from '../exercise/engine'
import { useImageUrl } from '../library/images'
import { IconButton, Range } from './components'

function ValueReference({ src, title, grouped }: { src?: string; title: string; grouped: boolean }) {
  const photo = useRef<HTMLImageElement>(null)
  const sheet = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState('')
  useEffect(() => {
    const image = photo.current
    const canvas = sheet.current
    if (!image || !canvas || !grouped || loaded !== src || !image.naturalWidth) return
    const factor = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = pixels.data
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      const level = luma < 85 ? valueLevels.dark : luma < 170 ? valueLevels.middle : valueLevels.light
      data[i] = data[i + 1] = data[i + 2] = level
    }
    ctx.putImageData(pixels, 0, 0)
  }, [src, loaded, grouped])
  return (
    <div className="board-mat value-reference">
      <img ref={photo} src={src} alt={title} hidden={grouped} onLoad={() => setLoaded(src ?? '')} />
      <canvas ref={sheet} hidden={!grouped} role="img" aria-label={title + ' in three values'} />
    </div>
  )
}

interface Props {
  exercise: Exercise
  board: RefObject<SurfaceHandle | null>
  dispatch: Dispatch<Parameters<typeof exerciseReducer>[1]>
  blocked: boolean
  finish: () => void
  configure: () => void
  library: () => void
  history: () => void
}

export function ValueStudy({
  exercise,
  board,
  dispatch,
  blocked,
  finish,
  configure,
  library,
  history,
}: Props) {
  const [value, setValue] = useState<PaintValue>('middle')
  const [erasing, setErasing] = useState(false)
  const [size, setSize] = useState(48)
  const image = useImageUrl(exercise.reference)
  const strokes = useMemo(() => visibleStrokes(exercise.trace), [exercise.trace])
  const finished = exercise.stage === 'compare'
  const grouped = !!exercise.groupedValues
  function edit(action: 'undo' | 'redo') {
    board.current?.finish()
    dispatch({ type: action })
  }
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if (
        finished ||
        blocked ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, select, dialog, [contenteditable=true]'))
      )
        return
      const key = event.key.toLowerCase()
      if (event.metaKey || event.ctrlKey) {
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          board.current?.finish()
          dispatch({ type: event.shiftKey || key === 'y' ? 'redo' : 'undo' })
        }
      } else if (key === 'b' || key === 'e') {
        board.current?.finish()
        setErasing(key === 'e')
      }
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  }, [finished, blocked, board, dispatch])
  return (
    <main className="page value-page">
      <div className="page-heading">
        <div>
          <h1>Value Breakdown</h1>
          <p>
            {finished
              ? exercise.reference.title
              : 'Paint the largest light, middle, and dark shapes you see.'}
          </p>
        </div>
        <div className="heading-actions">
          <button className="button" onClick={configure}>
            Change practice mode
          </button>
          <button className="button primary" onClick={finished ? history : finish}>
            {finished ? 'View session history' : 'Finish value study'}
          </button>
        </div>
      </div>
      <div className="value-panes">
        <section className="drawing-board">
          <div className="board-heading">
            <h2>Reference</h2>
            <div className="segmented" role="group" aria-label="Reference view">
              {['Original', '3 values'].map((label, i) => (
                <button
                  key={label}
                  className={grouped === Boolean(i) ? 'chosen' : ''}
                  aria-pressed={grouped === Boolean(i)}
                  onClick={() => dispatch({ type: 'value-view', grouped: Boolean(i) })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ValueReference src={image} title={exercise.reference.title} grouped={grouped} />
        </section>
        <section className="drawing-board">
          <div className="board-heading">
            <h2>Your study</h2>
            <div className="board-actions">
              {!finished && (
                <>
                  <IconButton label="Undo" disabled={!exercise.trace.cursor} onClick={() => edit('undo')}>
                    <Undo2 />
                  </IconButton>
                  <IconButton
                    label="Redo"
                    disabled={exercise.trace.cursor === exercise.trace.edits.length}
                    onClick={() => edit('redo')}
                  >
                    <Redo2 />
                  </IconButton>
                </>
              )}
              <IconButton label="Fit study" onClick={() => board.current?.fit()}>
                <Maximize />
              </IconButton>
            </div>
          </div>
          <div className="board-mat">
            <Surface
              ref={board}
              label="Value drawing surface"
              variant="split"
              width={exercise.reference.width}
              height={exercise.reference.height}
              strokes={strokes}
              size={size}
              paintValue={value}
              tool={finished ? 'pan' : erasing ? 'eraser' : 'pencil'}
              disabled={blocked}
              onStroke={(stroke, ms) =>
                dispatch({ type: 'stroke', id: exercise.id, stage: 'trace', stroke, ms })
              }
            />
          </div>
        </section>
      </div>
      {!finished && (
        <div className="value-tools" role="toolbar" aria-label="Value painting tools">
          <div className="value-swatches">
            {(Object.keys(valueLevels) as PaintValue[]).map((tone) => (
              <button
                key={tone}
                className="button"
                aria-pressed={!erasing && value === tone}
                onClick={() => {
                  setValue(tone)
                  setErasing(false)
                }}
              >
                <i style={{ background: valueColor(tone) }} />
                {tone}
              </button>
            ))}
          </div>
          <IconButton label="Brush" active={!erasing} onClick={() => setErasing(false)}>
            <Brush />
          </IconButton>
          <IconButton label="Eraser" active={erasing} onClick={() => setErasing(true)}>
            <Eraser />
          </IconButton>
          <Range
            label={erasing ? 'Eraser size' : 'Brush size'}
            value={size}
            min={4}
            max={120}
            unit=" px"
            onChange={setSize}
          />
        </div>
      )}
      <div className="value-credit">
        <span>
          {exercise.reference.title} · {exercise.reference.creator} · {exercise.reference.license}
        </span>
        {exercise.reference.sourceUrl && (
          <a href={exercise.reference.sourceUrl} target="_blank" rel="noreferrer">
            Source
          </a>
        )}
        {exercise.reference.licenseUrl && (
          <a href={exercise.reference.licenseUrl} target="_blank" rel="noreferrer">
            License
          </a>
        )}
        <button className="text-button" onClick={library}>
          Change reference
        </button>
      </div>
    </main>
  )
}
