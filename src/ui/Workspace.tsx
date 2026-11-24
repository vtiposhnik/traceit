import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Columns2,
  Eraser,
  Eye,
  EyeOff,
  Frame,
  Hand,
  Image as ImageIcon,
  Images,
  Infinity as InfinityIcon,
  Layers2,
  Maximize,
  Minus,
  Move,
  MousePointer2,
  PanelRightOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scan,
  SlidersHorizontal,
  Timer,
  Trash2,
  Undo2,
} from 'lucide-react'
import { ink, visibleStrokes, type Stroke, type Tool } from '../drawing/model'
import { Surface, type SurfaceHandle } from '../drawing/Surface'
import { Clock } from '../exercise/Clock'
import { exerciseReducer, isDrawing, type Comparison, type Exercise } from '../exercise/engine'
import { Transfer } from '../exercise/Transfer'
import { collection } from '../library/collection'
import { useImageUrl } from '../library/images'
import { sourceNames, type Reference } from '../library/reference'
import { IconButton, Panel, Range, ReferenceThumb, Toggle } from './components'

const empty: Stroke[] = []
const stepList = [
  { key: 'trace', title: 'Trace' },
  { key: 'reconstruct', title: 'Reconstruct' },
  { key: 'compare', title: 'Compare' },
]
type Props = {
  exercise: Exercise
  dispatch: Dispatch<Parameters<typeof exerciseReducer>[1]>
  board: RefObject<SurfaceHandle | null>
  from: DOMRect | null
  paused: boolean
  pause: () => void
  restart: () => void
  advance: () => void
  complete: () => void
  comparisonSaved: boolean
  configure: (ref: Reference) => void
  library: () => void
  clear: () => void
  blocked: boolean
}

export function Workspace({
  exercise: ex,
  dispatch,
  board,
  from,
  paused,
  pause,
  restart,
  advance,
  complete,
  comparisonSaved,
  configure,
  library,
  clear,
  blocked,
}: Props) {
  const { reference, stage, comparison } = ex
  const [tool, setTool] = useState<Tool>('pencil')
  const [size, setSize] = useState(5)
  const [eraserSize, setEraserSize] = useState(30)
  const [opacity, setOpacity] = useState(85)
  const [adaptive, setAdaptive] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [hidden, setHidden] = useState(false)
  const [reviewTool, setReviewTool] = useState<'move' | 'pan'>('move')
  const preview = useRef<SurfaceHandle>(null)
  const separateTrace = useRef<SurfaceHandle>(null)
  const separateReconstruction = useRef<SurfaceHandle>(null)
  const image = useImageUrl(reference)
  const trace = useMemo(() => visibleStrokes(ex.trace), [ex.trace])
  const reconstruction = useMemo(() => visibleStrokes(ex.reconstruct), [ex.reconstruct])
  const draw = isDrawing(stage)
  const review = stage === 'compare'
  const second = stage === 'transfer' || stage === 'reconstruct'
  const active = stage === 'trace' || review ? trace : stage === 'transfer' ? empty : reconstruction
  const history = stage === 'reconstruct' ? ex.reconstruct : ex.trace
  const selectedTool = review ? (comparison.reconstructionVisible ? reviewTool : 'pan') : tool
  const currentSize = tool === 'eraser' ? eraserSize : size
  const drawLocked = blocked || paused || stage === 'transfer'
  const edit = (type: 'undo' | 'redo') => {
    board.current?.finish()
    dispatch({ type })
  }
  const adjust = (patch: Partial<Comparison>) => dispatch({ type: 'adjust', id: ex.id, patch })
  useEffect(() => {
    setZoom(1)
    setTool('pencil')
  }, [stage])
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        drawLocked ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable=true],dialog'))
      )
        return
      if (review) {
        if (!e.metaKey && !e.ctrlKey) {
          if (e.key.toLowerCase() === 'h') setReviewTool('pan')
          if (e.key.toLowerCase() === 'v') setReviewTool('move')
        }
        return
      }
      if (!draw) return
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') {
          e.preventDefault()
          edit(e.shiftKey || e.key.toLowerCase() === 'y' ? 'redo' : 'undo')
        }
        return
      }
      const keys: Record<string, Tool> = { b: 'pencil', e: 'eraser', h: 'pan' }
      if (keys[e.key.toLowerCase()]) {
        board.current?.finish()
        setTool(keys[e.key.toLowerCase()])
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [drawLocked, draw, review, board, dispatch])
  const separate = review && comparison.separate
  const common = { width: reference.width, height: reference.height, size: currentSize }
  const stageNumber = stage === 'trace' ? 0 : review ? 2 : 1
  return (
    <main className="page workspace-page">
      <div className="page-heading">
        <div>
          <h1>{review ? 'Compare drawings' : 'Practice workspace'}</h1>
          <p>
            {review
              ? 'Study the differences between your tracing and reconstruction.'
              : second
                ? 'Redraw your tracing on the blank sheet beside it.'
                : 'Trace the reference, observing its shapes and proportions.'}
          </p>
        </div>
        <div className="heading-actions">
          {ex.config.mode === 'timed' && draw && (
            <div className="timer-controls">
              <Clock exercise={ex} />
              <IconButton label={paused ? 'Resume timer' : 'Pause timer'} onClick={pause}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </IconButton>
              <IconButton label="Restart challenge" onClick={restart}>
                <RotateCcw size={15} />
              </IconButton>
            </div>
          )}
          <button
            className="button mode-button"
            onClick={() => configure(reference)}
            aria-label="Change practice mode"
          >
            {ex.config.mode === 'free' ? <InfinityIcon /> : <Timer />}
            {ex.config.mode === 'free' ? 'Free practice' : 'Timed challenge'}
            <ChevronDown size={14} />
          </button>
          <button
            className="button primary"
            onClick={review ? complete : advance}
            disabled={stage === 'transfer' || paused}
          >
            {review ? 'Finish session' : second ? 'Finish reconstruction' : 'Finish tracing'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <ol className="stage-rail" aria-label="Exercise stages">
        {stepList.map((step, i) => (
          <li
            key={step.key}
            aria-current={i === stageNumber ? 'step' : undefined}
            className={i === stageNumber ? 'active' : i < stageNumber ? 'done' : ''}
          >
            <span className="step-number">{i < stageNumber ? <Check size={14} /> : '0' + (i + 1)}</span>
            <span>{step.title}</span>
            <span className="step-line" />
            {i !== 2 && <ChevronRight size={15} className="step-arrow" />}
          </li>
        ))}
      </ol>
      <div className="work-grid">
        <section className="drawing-board" aria-label="Drawing board">
          <div className="board-heading">
            <div className="board-title">
              <Scan size={17} />
              <h2>Drawing board</h2>
            </div>
            <div className="board-actions">
              {second && (
                <button className="mobile-preview-button" onClick={() => setHidden(!hidden)}>
                  <PanelRightOpen size={15} />
                  Tracing
                </button>
              )}
              {!separate && (
                <>
                  <div className="zoom-control">
                    <IconButton
                      label="Zoom out"
                      disabled={zoom <= 0.35}
                      onClick={() => board.current?.zoom(zoom / 1.25)}
                    >
                      <Minus />
                    </IconButton>
                    <span aria-label="Canvas zoom">{Math.round(zoom * 100)}%</span>
                    <IconButton
                      label="Zoom in"
                      disabled={zoom >= 5}
                      onClick={() => board.current?.zoom(zoom * 1.25)}
                    >
                      <Plus />
                    </IconButton>
                  </div>
                  <i className="divider" />
                  <IconButton label="Fit drawing to board" onClick={() => board.current?.fit()}>
                    <Maximize size={16} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
          <div className={'board-mat ' + (separate ? 'split-mode' : '')}>
            {separate ? (
              <div className="split-surfaces">
                {[
                  {
                    title: 'Tracing',
                    ref: separateTrace,
                    peer: separateReconstruction,
                    strokes: trace,
                    color: ink.trace,
                    alpha: comparison.traceVisible ? comparison.traceOpacity : 0,
                  },
                  {
                    title: 'Reconstruction',
                    ref: separateReconstruction,
                    peer: separateTrace,
                    strokes: reconstruction,
                    color: ink.reconstruct,
                    alpha: comparison.reconstructionVisible ? comparison.reconstructionOpacity : 0,
                  },
                ].map((v) => (
                  <div className="split-pane" key={v.title}>
                    <span className="split-title">{v.title}</span>
                    <Surface
                      {...common}
                      ref={v.ref}
                      onViewChange={comparison.linkedViews ? (view) => v.peer.current?.setSheetView(view) : undefined}
                      label={v.title + ' separate view'}
                      variant="split"
                      tool="pan"
                      strokes={v.strokes}
                      color={v.color}
                      baseOpacity={v.alpha / 100}
                      image={comparison.originalVisible ? image : undefined}
                      imageOpacity={0.5}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Surface
                {...common}
                key={stage}
                ref={board}
                label="Main drawing surface"
                strokes={active}
                overlay={review ? reconstruction : undefined}
                alignment={comparison.offset}
                overlayScale={comparison.reconstructionScale / 100}
                onAlign={(offset) => adjust({ offset })}
                color={review ? ink.trace : ink.pencil}
                baseOpacity={review ? (comparison.traceVisible ? comparison.traceOpacity / 100 : 0) : 1}
                overlayOpacity={
                  review ? (comparison.reconstructionVisible ? comparison.reconstructionOpacity / 100 : 0) : 1
                }
                image={stage === 'trace' || (review && comparison.originalVisible) ? image : undefined}
                imageOpacity={review ? 0.5 : opacity / 100}
                adaptive={adaptive && stage === 'trace'}
                tool={selectedTool}
                disabled={drawLocked}
                onZoom={setZoom}
                onStroke={(stroke, ms) => {
                  if (isDrawing(stage)) dispatch({ type: 'stroke', id: ex.id, stage, stroke, ms })
                }}
              />
            )}
            {!separate && (
              <div className="tool-rail" role="toolbar" aria-label="Drawing tools">
                {review ? (
                  <IconButton
                    label="Move reconstruction (V)"
                    disabled={!comparison.reconstructionVisible}
                    active={selectedTool === 'move'}
                    onClick={() => setReviewTool('move')}
                  >
                    <Move />
                  </IconButton>
                ) : (
                  <>
                    <IconButton
                      label="Pencil (B)"
                      active={tool === 'pencil'}
                      disabled={drawLocked}
                      onClick={() => setTool('pencil')}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label="Eraser (E)"
                      active={tool === 'eraser'}
                      disabled={drawLocked}
                      onClick={() => setTool('eraser')}
                    >
                      <Eraser />
                    </IconButton>
                  </>
                )}
                <IconButton
                  label="Pan (H)"
                  active={selectedTool === 'pan'}
                  onClick={() => (review ? setReviewTool('pan') : setTool('pan'))}
                >
                  <Hand />
                </IconButton>
                {!review && (
                  <>
                    <i />
                    <IconButton
                      label="Undo"
                      disabled={!history.cursor || drawLocked}
                      onClick={() => edit('undo')}
                    >
                      <Undo2 />
                    </IconButton>
                    <IconButton
                      label="Redo"
                      disabled={history.cursor === history.edits.length || drawLocked}
                      onClick={() => edit('redo')}
                    >
                      <Redo2 />
                    </IconButton>
                    <i />
                    <IconButton label="Clear drawing" disabled={!active.length || drawLocked} onClick={clear}>
                      <Trash2 />
                    </IconButton>
                  </>
                )}
              </div>
            )}
            {paused && draw && (
              <div className="paused-sheet">
                <div>
                  <Pause size={25} />
                  <h3>Practice paused</h3>
                  <button className="button primary" onClick={pause}>
                    <Play size={15} />
                    Resume practice
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="board-status">
            <span>
              <i className="status-dot" />
              {review
                ? separate
                  ? 'Separate views'
                  : 'Comparison overlay'
                : second
                  ? 'Reconstruction layer'
                  : 'Tracing layer'}
            </span>
            <span className="canvas-hint">
              <MousePointer2 size={12} />
              {review && !separate && selectedTool === 'move' ? 'Drag to align' : 'Scroll to zoom'}
              <i />
              Space + drag to pan
            </span>
          </div>
        </section>
        <aside className="inspector" aria-label="Exercise controls">
          {stage === 'trace' && (
            <Panel title="Reference" icon={ImageIcon}>
              <div className="reference-identity">
                <ReferenceThumb item={reference} />
                <div>
                  <span className="micro">{reference.subject}</span>
                  <h3>{reference.title}</h3>
                  <small>{sourceNames[reference.source]}</small>
                </div>
              </div>
              <button className="button change-ref" onClick={library}>
                <Images size={16} />
                Change reference
              </button>
              {reference.source === 'openverse' && (
                <p className="credit">
                  <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
                    {reference.creator}
                  </a>{' '}
                  ·{' '}
                  <a href={reference.licenseUrl} target="_blank" rel="noreferrer">
                    {reference.license}
                  </a>
                </p>
              )}
            </Panel>
          )}
          {second && (
            <section className={'panel trace-panel ' + (hidden ? 'hidden-trace' : '')}>
              <div className="trace-heading">
                <h2>
                  <Layers2 size={17} />
                  Your tracing
                </h2>
                <IconButton
                  label={hidden ? 'Show traced reference' : 'Hide traced reference'}
                  onClick={() => setHidden(!hidden)}
                >
                  {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
              </div>
              <div className="trace-preview">
                <Surface
                  {...common}
                  ref={preview}
                  label="Traced reference"
                  variant="panel"
                  strokes={stage === 'transfer' ? empty : trace}
                  tool="pan"
                  onZoom={setPreviewZoom}
                />
              </div>
              <div className="preview-controls">
                <span>Drag to pan</span>
                <IconButton
                  label="Zoom out tracing"
                  onClick={() => preview.current?.zoom(previewZoom / 1.25)}
                >
                  <Minus size={14} />
                </IconButton>
                <span>{Math.round(previewZoom * 100)}%</span>
                <IconButton label="Zoom in tracing" onClick={() => preview.current?.zoom(previewZoom * 1.25)}>
                  <Plus size={14} />
                </IconButton>
                <IconButton label="Fit traced reference" onClick={() => preview.current?.fit()}>
                  <Frame size={14} />
                </IconButton>
              </div>
            </section>
          )}
          {review ? (
            <Panel title="Comparison controls" icon={Layers2}>
              <div className="segmented">
                <button
                  className={!separate ? 'chosen' : ''}
                  aria-pressed={!separate}
                  onClick={() => {
                    adjust({ separate: false })
                    setZoom(1)
                  }}
                >
                  <Layers2 size={14} />
                  Overlay
                </button>
                <button
                  className={separate ? 'chosen' : ''}
                  aria-pressed={separate}
                  onClick={() => adjust({ separate: true })}
                >
                  <Columns2 size={14} />
                  Separate
                </button>
              </div>
              {separate ? (
                <Toggle
                  label="Link pan and zoom"
                  on={comparison.linkedViews}
                  change={() => {
                    if (!comparison.linkedViews) {
                      const view = separateTrace.current?.sheetView()
                      if (view) separateReconstruction.current?.setSheetView(view)
                    }
                    adjust({ linkedViews: !comparison.linkedViews })
                  }}
                />
              ) : (
                <Range
                  label="Reconstruction scale"
                  value={comparison.reconstructionScale}
                  min={25}
                  max={400}
                  unit="%"
                  onChange={(reconstructionScale) => adjust({ reconstructionScale })}
                />
              )}
              <div className="layer-settings">
                {(['trace', 'reconstruct'] as const).map((key) => {
                  const first = key === 'trace'
                  const name = first ? 'Tracing' : 'Reconstruction'
                  const visible = first ? comparison.traceVisible : comparison.reconstructionVisible
                  return (
                    <div className="layer-setting" key={key}>
                      <div className="layer-heading">
                        <i style={{ background: first ? ink.trace : ink.reconstruct }} />
                        <strong>{name}</strong>
                        <IconButton
                          label={(visible ? 'Hide ' : 'Show ') + name.toLowerCase()}
                          aria-pressed={visible}
                          onClick={() =>
                            adjust(first ? { traceVisible: !visible } : { reconstructionVisible: !visible })
                          }
                        >
                          {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                        </IconButton>
                      </div>
                      <Range
                        label={name + ' opacity'}
                        unit="%"
                        value={first ? comparison.traceOpacity : comparison.reconstructionOpacity}
                        onChange={(v) => adjust(first ? { traceOpacity: v } : { reconstructionOpacity: v })}
                      />
                    </div>
                  )
                })}
              </div>
              <Toggle
                label="Reveal original"
                on={comparison.originalVisible}
                change={() => adjust({ originalVisible: !comparison.originalVisible })}
              />
              <button
                className="button change-ref"
                onClick={() => {
                  separateTrace.current?.fit()
                  separateReconstruction.current?.fit()
                  adjust({ offset: { x: 0, y: 0 }, reconstructionScale: 100 })
                }}
              >
                <RotateCcw size={14} />
                Reset alignment
              </button>
              <button
                className="button change-ref"
                disabled={!comparisonSaved}
                onClick={() => dispatch({ type: 'retry-reconstruction' })}
              >
                <RotateCcw size={14} />
                Try reconstruction again
              </button>
            </Panel>
          ) : (
            <Panel title="Drawing controls" icon={SlidersHorizontal}>
              <Range
                label={tool === 'eraser' ? 'Eraser size' : 'Brush size'}
                value={currentSize}
                min={1}
                max={tool === 'eraser' ? 100 : 40}
                unit=" px"
                onChange={tool === 'eraser' ? setEraserSize : setSize}
              />
              {stage === 'trace' && (
                <>
                  <Range label="Reference opacity" value={opacity} unit="%" onChange={setOpacity} />
                  <div className="adaptive-control">
                    <Toggle label="Adaptive dimming" on={adaptive} change={() => setAdaptive(!adaptive)} />
                    <p>Fade the reference while drawing.</p>
                  </div>
                </>
              )}
            </Panel>
          )}
          {review && comparison.originalVisible && (
            <Panel title="Original reference" icon={ImageIcon}>
              <div className="reference-identity">
                <ReferenceThumb item={reference} />
                <div>
                  <span className="micro">{sourceNames[reference.source]}</span>
                  <h3>{reference.title}</h3>
                </div>
              </div>
              <p className="credit">
                {reference.sourceUrl ? (
                  <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
                    {reference.creator}
                  </a>
                ) : (
                  reference.creator
                )}{' '}
                ·{' '}
                {reference.licenseUrl ? (
                  <a href={reference.licenseUrl} target="_blank" rel="noreferrer">
                    {reference.license}
                  </a>
                ) : (
                  reference.license
                )}
              </p>
            </Panel>
          )}
          <div className="studio-note">
            <div>
              <BookOpen size={17} />
              <h2>Studio note</h2>
            </div>
            <p>
              {review
                ? 'Align one landmark, then compare the angles and distances around it.'
                : second
                  ? 'Use your tracing as a guide. Check the outer shape before adding the smaller details.'
                  : (reference.note ??
                    'Start with the largest shapes. Compare their angles before adding the details.')}
            </p>
          </div>
        </aside>
      </div>
      {stage === 'trace' && (
        <section className="shelf">
          <div className="shelf-heading">
            <h2>Reference shelf</h2>
            <span className="shelf-line" />
            <button className="text-button" onClick={library}>
              View library <ArrowRight size={15} />
            </button>
          </div>
          <div className="shelf-grid">
            {collection.map((item) => (
              <button
                key={item.id}
                className={'shelf-item ' + (item.id === reference.id ? 'current' : '')}
                onClick={() => configure(item)}
                aria-label={'Practice with ' + item.title}
              >
                <ReferenceThumb item={item} />
                <span>
                  <small>{item.subject}</small>
                  <strong>{item.title}</strong>
                </span>
                {item.id === reference.id && <CheckCheck className="shelf-selected" size={14} />}
              </button>
            ))}
          </div>
        </section>
      )}
      {stage === 'transfer' && from && (
        <Transfer from={from} target={preview} strokes={trace} reference={reference} />
      )}
    </main>
  )
}
