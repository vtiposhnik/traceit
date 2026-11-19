export type Point = [x: number, y: number, pressure: number]
export type Tool = 'pencil' | 'eraser' | 'pan' | 'move'
export interface Stroke {
  tool: 'pencil' | 'eraser' | 'clear'
  points: Point[]
  size: number
  simulatePressure: boolean
}
export interface History {
  edits: Stroke[]
  cursor: number
}

export const emptyHistory = (): History => ({ edits: [], cursor: 0 })
export const append = (history: History, stroke: Stroke): History => ({
  edits: [...history.edits.slice(0, history.cursor), stroke],
  cursor: history.cursor + 1,
})
export function visibleStrokes(history: History) {
  let start = history.cursor
  while (start > 0 && history.edits[start - 1].tool !== 'clear') start--
  return history.edits.slice(start, history.cursor)
}

export const ink = { pencil: '#322c26', trace: '#626e49', reconstruct: '#ac563c' }
export interface Offset {
  x: number
  y: number
}
export interface View extends Offset {
  zoom: number
}
export const fitView: View = { x: 0, y: 0, zoom: 1 }
export const clampZoom = (n: number) => Math.min(5, Math.max(0.35, n))
export function logicalSize(width: number, height: number) {
  const factor = 1000 / Math.max(width, height)
  return { width: width * factor, height: height * factor }
}
