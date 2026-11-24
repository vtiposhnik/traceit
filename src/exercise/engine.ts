import { localId } from '../storage/identity'
import {
  append,
  emptyHistory,
  visibleStrokes,
  type History,
  type Offset,
  type Stroke,
} from '../drawing/model'
import type { Reference } from '../library/reference'

export type DrawingStage = 'trace' | 'reconstruct'
export type Stage = DrawingStage | 'transfer' | 'compare'
export interface PracticeConfig {
  mode: 'free' | 'timed'
  seconds: number
}
interface Durations {
  trace: number
  reconstruct: number
}
export interface Comparison {
  offset: Offset
  traceVisible: boolean
  reconstructionVisible: boolean
  originalVisible: boolean
  traceOpacity: number
  reconstructionOpacity: number
  reconstructionScale: number
  linkedViews: boolean
  separate: boolean
}
export interface Session {
  id: string
  reference: Reference
  config: PracticeConfig
  trace: Stroke[]
  reconstruct: Stroke[]
  elapsed: Durations
  drawingTime: Durations
  completedAt: number
  comparison: Comparison
}
export interface Exercise {
  id: string
  reference: Reference
  config: PracticeConfig
  stage: Stage
  trace: History
  reconstruct: History
  elapsed: Durations
  drawingTime: Durations
  runningSince: number | null
  completedAt: number | null
  comparison: Comparison
}
const durations = (): Durations => ({ trace: 0, reconstruct: 0 })
export const isDrawing = (stage: Stage): stage is DrawingStage => stage === 'trace' || stage === 'reconstruct'
export function newExercise(reference: Reference, config: PracticeConfig): Exercise {
  return {
    id: localId(),
    reference,
    config,
    stage: 'trace',
    trace: emptyHistory(),
    reconstruct: emptyHistory(),
    elapsed: durations(),
    drawingTime: durations(),
    runningSince: null,
    completedAt: null,
    comparison: {
      offset: { x: 0, y: 0 },
      traceVisible: true,
      reconstructionVisible: true,
      originalVisible: false,
      traceOpacity: 80,
      reconstructionOpacity: 90,
      separate: false,
      reconstructionScale: 100,
      linkedViews: true,
    },
  }
}
export function stageTime(exercise: Exercise, now: number) {
  if (!isDrawing(exercise.stage)) return 0
  const elapsed =
    exercise.elapsed[exercise.stage] +
    (exercise.runningSince === null ? 0 : Math.max(0, now - exercise.runningSince))
  return exercise.config.mode === 'timed' ? Math.min(elapsed, exercise.config.seconds * 1000) : elapsed
}
function stopClock(exercise: Exercise, now: number): Exercise {
  if (!isDrawing(exercise.stage) || exercise.runningSince === null) return exercise
  return {
    ...exercise,
    runningSince: null,
    elapsed: { ...exercise.elapsed, [exercise.stage]: stageTime(exercise, now) },
  }
}
type Action =
  | { type: 'start'; reference: Reference; config: PracticeConfig }
  | { type: 'review'; session: Session }
  | { type: 'clock'; run: boolean; now: number }
  | { type: 'stroke'; id: string; stage: DrawingStage; stroke: Stroke; ms: number }
  | { type: 'undo' | 'redo' | 'clear' }
  | { type: 'advance'; id: string; stage: DrawingStage; now: number; completedAt: number }
  | { type: 'land'; id: string }
  | { type: 'adjust'; id: string; patch: Partial<Comparison> }

export function exerciseReducer(state: Exercise, action: Action): Exercise {
  if ('id' in action && action.id !== state.id) return state
  switch (action.type) {
    case 'start':
      return newExercise(action.reference, action.config)
    case 'review': {
      const s = action.session
      return {
        ...s,
        comparison: {
          ...s.comparison,
          reconstructionScale: s.comparison.reconstructionScale ?? 100,
          linkedViews: s.comparison.linkedViews ?? true,
        },
        stage: 'compare',
        runningSince: null,
        trace: { edits: s.trace, cursor: s.trace.length },
        reconstruct: { edits: s.reconstruct, cursor: s.reconstruct.length },
      }
    }
    case 'clock':
      if (!action.run) return stopClock(state, action.now)
      if (state.runningSince !== null || !isDrawing(state.stage)) return state
      return { ...state, runningSince: action.now }
    case 'stroke':
      if (state.stage !== action.stage) return state
      return {
        ...state,
        [action.stage]: append(state[action.stage], action.stroke),
        drawingTime: { ...state.drawingTime, [action.stage]: state.drawingTime[action.stage] + action.ms },
      }
    case 'undo':
    case 'redo':
    case 'clear': {
      if (!isDrawing(state.stage)) return state
      const history = state[state.stage]
      if (action.type === 'clear')
        return {
          ...state,
          [state.stage]: append(history, { tool: 'clear', size: 0, points: [], simulatePressure: false }),
        }
      const cursor = Math.max(
        0,
        Math.min(history.edits.length, history.cursor + (action.type === 'undo' ? -1 : 1)),
      )
      return { ...state, [state.stage]: { ...history, cursor } }
    }
    case 'advance': {
      if (action.stage !== state.stage) return state
      const next = stopClock(state, action.now)
      return state.stage === 'trace'
        ? { ...next, stage: 'transfer' }
        : { ...next, stage: 'compare', completedAt: action.completedAt }
    }
    case 'land':
      return state.stage === 'transfer' ? { ...state, stage: 'reconstruct' } : state
    case 'adjust':
      return { ...state, comparison: { ...state.comparison, ...action.patch } }
  }
}
export function toSession(state: Exercise): Session {
  if (state.stage !== 'compare' || state.completedAt === null)
    throw new Error('The exercise is still in progress.')
  return {
    id: state.id,
    reference: state.reference,
    config: state.config,
    trace: visibleStrokes(state.trace),
    reconstruct: visibleStrokes(state.reconstruct),
    elapsed: state.elapsed,
    drawingTime: state.drawingTime,
    completedAt: state.completedAt,
    comparison: state.comparison,
  }
}
export function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0')
}
