import { getStroke } from 'perfect-freehand'
import { valueColor, type Stroke } from './model'

const paths = new WeakMap<Stroke, Path2D>()

function outline(stroke: Stroke, complete: boolean) {
  if (complete && paths.has(stroke)) return paths.get(stroke)!
  const points = getStroke(stroke.points, {
    size: stroke.size,
    thinning: stroke.tool === 'eraser' ? 0 : 0.48,
    smoothing: 0.55,
    streamline: 0.38,
    simulatePressure: stroke.simulatePressure,
    last: complete,
  })
  const path = new Path2D()
  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    path.moveTo((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const next = points[(i + 1) % points.length]
      path.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2)
    }
    path.closePath()
  }
  if (complete) paths.set(stroke, path)
  return path
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string, complete = true) {
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.fillStyle = stroke.value ? valueColor(stroke.value) : color
  ctx.fill(outline(stroke, complete))
  ctx.globalCompositeOperation = 'source-over'
}

export function drawPlate(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  width: number,
  height: number,
  color: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
  ctx.clearRect(0, 0, width, height)
  for (const stroke of strokes) paintStroke(ctx, stroke, color)
}
