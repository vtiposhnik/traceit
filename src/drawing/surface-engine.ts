import { clampZoom, fitView, ink, logicalSize, type Offset, type Stroke, type Tool, type View } from './model'
import { paintStroke } from './render'

export interface SurfaceOptions {
  width: number
  height: number
  strokes: Stroke[]
  overlay?: Stroke[]
  color?: string
  alignment?: Offset
  tool: Tool
  size: number
  disabled?: boolean
  variant?: 'desk' | 'panel' | 'split'
  onStroke?: (stroke: Stroke, milliseconds: number) => void
  onAlign?: (offset: Offset) => void
  onZoom?: (zoom: number) => void
}
interface Elements {
  host: HTMLDivElement
  paper: HTMLDivElement
  base: HTMLCanvasElement
  overlay: HTMLCanvasElement
  cursor: HTMLDivElement
}
type Gesture =
  | { kind: 'stroke'; id: number; stroke: Stroke; since: number }
  | { kind: 'pan' | 'move'; id: number; start: Offset; original: Offset }

export class SurfaceEngine {
  private view: View = { ...fitView }
  private gesture: Gesture | null = null
  private offset: Offset | null = null
  private cache = document.createElement('canvas')
  private baseDirty = true
  private frame = 0
  private space = false
  private observer: ResizeObserver
  private listeners = new AbortController()

  constructor(
    private el: Elements,
    private options: SurfaceOptions,
  ) {
    const host = el.host
    const signal = this.listeners.signal
    host.addEventListener('pointerdown', this.down, { signal })
    host.addEventListener('pointermove', this.move, { signal })
    host.addEventListener('pointerup', this.up, { signal })
    host.addEventListener('pointercancel', this.interrupt, { signal })
    host.addEventListener('lostpointercapture', this.interrupt, { signal })
    host.addEventListener('pointerleave', this.hideCursor, { signal })
    host.addEventListener('wheel', this.wheel, { passive: false, signal })
    window.addEventListener('keydown', this.keyDown, { signal })
    window.addEventListener('keyup', this.keyUp, { signal })
    window.addEventListener('blur', this.blur, { signal })
    window.addEventListener('resize', this.resize, { signal })
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(host)
    this.render()
  }

  update(options: SurfaceOptions) {
    if (
      this.options.strokes !== options.strokes ||
      this.options.color !== options.color ||
      this.options.width !== options.width ||
      this.options.height !== options.height
    )
      this.baseDirty = true
    this.options = options
    this.schedule()
  }

  private geometry() {
    const { clientWidth: w, clientHeight: h } = this.el.host
    const size = logicalSize(this.options.width, this.options.height)
    const desk = (this.options.variant ?? 'desk') === 'desk'
    const mobile = desk && matchMedia('(max-width: 580px)').matches
    const left = mobile ? 14 : desk ? (w > 550 ? 82 : 58) : 10
    const right = desk ? (w > 550 ? 37 : 14) : 10
    const vertical = desk ? (w > 550 ? 32 : 16) : 9
    const top = mobile ? 54 : vertical
    const fit = Math.min(
      Math.max(1, w - left - right) / size.width,
      Math.max(1, h - top - vertical) / size.height,
    )
    const scale = fit * this.view.zoom
    const x = (w + left - right - size.width * scale) / 2 + this.view.x
    const y = (h + top - vertical - size.height * scale) / 2 + this.view.y
    return { ...size, scale, x, y }
  }

  private clientFrame() {
    const frame = this.geometry()
    const host = this.el.host.getBoundingClientRect()
    return { ...frame, x: host.left + frame.x, y: host.top + frame.y }
  }

  paperBox() {
    const { x, y, width, height, scale } = this.clientFrame()
    return new DOMRect(x, y, width * scale, height * scale)
  }

  setZoom(value: number, anchor?: Offset) {
    if (this.gesture) return
    const before = this.geometry()
    const at = anchor ?? {
      x: before.x + (before.width * before.scale) / 2,
      y: before.y + (before.height * before.scale) / 2,
    }
    this.view.zoom = clampZoom(value)
    const after = this.geometry()
    const ratio = after.scale / before.scale
    this.view.x += at.x - (at.x - before.x) * ratio - after.x
    this.view.y += at.y - (at.y - before.y) * ratio - after.y
    this.options.onZoom?.(this.view.zoom)
    this.baseDirty = true
    this.schedule()
  }

  fit() {
    this.finish()
    this.view = { ...fitView }
    this.options.onZoom?.(1)
    this.baseDirty = true
    this.schedule()
  }

  private local(event: PointerEvent | WheelEvent): Offset {
    const box = this.el.host.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  private addPoint(event: PointerEvent, stroke: Stroke, frame: Offset & { scale: number }) {
    const x = (event.clientX - frame.x) / frame.scale
    const y = (event.clientY - frame.y) / frame.scale
    const last = stroke.points[stroke.points.length - 1]
    if (last && Math.hypot(last[0] - x, last[1] - y) < 0.25) return
    const pressure = event.pressure > 0 ? event.pressure : (last?.[2] ?? 0.5)
    stroke.points.push([x, y, pressure])
  }

  private down = (event: PointerEvent) => {
    if (this.options.disabled || this.gesture || !event.isPrimary || event.button > 1) return
    const tool = this.space || event.button === 1 ? 'pan' : this.options.tool
    if (tool === 'pan' || tool === 'move') {
      this.gesture = {
        kind: tool,
        id: event.pointerId,
        start: this.local(event),
        original: tool === 'pan' ? { ...this.view } : { ...(this.options.alignment ?? { x: 0, y: 0 }) },
      }
      this.el.host.classList.add('dragging')
    } else {
      const frame = this.clientFrame()
      const x = event.clientX - frame.x
      const y = event.clientY - frame.y
      if (x < 0 || y < 0 || x > frame.width * frame.scale || y > frame.height * frame.scale) return
      const stroke: Stroke = {
        tool,
        points: [],
        size: this.options.size,
        simulatePressure: event.pointerType === 'mouse' || event.pressure <= 0,
      }
      this.addPoint(event, stroke, frame)
      this.gesture = { kind: 'stroke', id: event.pointerId, stroke, since: performance.now() }
      this.el.host.classList.add('drawing')
    }
    event.preventDefault()
    this.el.host.focus({ preventScroll: true })
    this.el.host.setPointerCapture(event.pointerId)
    this.schedule()
  }

  private move = (event: PointerEvent) => {
    const active = this.gesture
    if (active && active.id !== event.pointerId) return
    this.updateCursor(event)
    if (!active) return
    if (active.kind === 'stroke') {
      const frame = this.clientFrame()
      const samples = event.getCoalescedEvents?.()
      for (const sample of samples?.length ? samples : [event]) this.addPoint(sample, active.stroke, frame)
    } else {
      const p = this.local(event)
      const scale = active.kind === 'pan' ? 1 : this.geometry().scale
      const offset = {
        x: active.original.x + (p.x - active.start.x) / scale,
        y: active.original.y + (p.y - active.start.y) / scale,
      }
      if (active.kind === 'pan') {
        this.view = { ...this.view, ...offset }
        this.baseDirty = true
      } else this.offset = offset
    }
    this.schedule()
  }

  private updateCursor(event: PointerEvent) {
    const tool = this.options.tool
    const cursor = this.el.cursor
    if (
      event.pointerType === 'touch' ||
      this.space ||
      this.options.disabled ||
      (tool !== 'pencil' && tool !== 'eraser')
    ) {
      this.hideCursor()
      return
    }
    const p = this.local(event)
    const width = Math.max(5, this.options.size * this.geometry().scale)
    cursor.style.cssText =
      'display:block;width:' + width + 'px;height:' + width + 'px;left:' + p.x + 'px;top:' + p.y + 'px'
  }
  private hideCursor = () => {
    this.el.cursor.style.display = 'none'
  }
  private up = (event: PointerEvent) => {
    if (this.gesture?.id !== event.pointerId) return
    this.move(event)
    this.finish()
  }
  private interrupt = (event: PointerEvent) => {
    if (event.pointerId === this.gesture?.id) this.finish()
  }

  finish() {
    const active = this.gesture
    if (!active) return
    this.gesture = null
    if (active.kind === 'stroke') this.options.onStroke?.(active.stroke, performance.now() - active.since)
    if (active.kind === 'move' && this.offset) this.options.onAlign?.(this.offset)
    this.offset = null
    this.el.host.classList.remove('drawing', 'dragging')
    if (this.el.host.hasPointerCapture(active.id)) this.el.host.releasePointerCapture(active.id)
    this.schedule()
  }

  private wheel = (event: WheelEvent) => {
    if (this.options.disabled) return
    event.preventDefault()
    const dy = event.deltaY * (event.deltaMode === 1 ? 16 : 1)
    this.setZoom(this.view.zoom * Math.exp(-dy * 0.0018), this.local(event))
  }
  private keyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (
      event.code !== 'Space' ||
      this.options.disabled ||
      !this.el.host.matches(':hover, :focus') ||
      target?.closest('textarea, select, input:not([type="range"]), dialog, [contenteditable=true]')
    )
      return
    // Space can modify a pointer drag while a toolbar button still owns keyboard focus.
    // A plain Space on that button keeps its native keyboard activation.
    if (!target?.closest('button, a, input')) event.preventDefault()
    this.space = true
    this.el.host.classList.add('panning')
    this.hideCursor()
  }
  private keyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      this.space = false
      this.el.host.classList.remove('panning')
    }
  }
  private blur = () => {
    this.space = false
    this.el.host.classList.remove('panning')
    this.finish()
  }
  private resize = () => {
    this.finish()
    this.baseDirty = true
    this.schedule()
  }

  private schedule() {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        this.render()
      })
  }
  private render() {
    const { host, paper, base, overlay } = this.el
    const rect = this.geometry()
    const dpr = window.devicePixelRatio || 1
    const width = Math.round(host.clientWidth * dpr)
    const height = Math.round(host.clientHeight * dpr)
    if (!width || !height) return
    // A remounted engine gets a fresh cache even when the DOM canvases retain their size.
    for (const layer of [base, overlay, this.cache]) {
      if (layer.width !== width || layer.height !== height) {
        layer.width = width
        layer.height = height
        this.baseDirty = true
      }
    }
    const project = (ctx: CanvasRenderingContext2D) => {
      ctx.setTransform(rect.scale * dpr, 0, 0, rect.scale * dpr, rect.x * dpr, rect.y * dpr)
      ctx.beginPath()
      ctx.rect(0, 0, rect.width, rect.height)
      ctx.clip()
    }
    const layer = this.cache.getContext('2d')!
    const ctx = base.getContext('2d')!
    if (this.baseDirty) {
      paper.style.width = rect.width * rect.scale + 'px'
      paper.style.height = rect.height * rect.scale + 'px'
      paper.style.transform = 'translate(' + rect.x + 'px, ' + rect.y + 'px)'
      layer.clearRect(0, 0, width, height)
      layer.save()
      project(layer)
      for (const stroke of this.options.strokes) paintStroke(layer, stroke, this.options.color ?? ink.pencil)
      layer.restore()
      this.baseDirty = false
    }
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(this.cache, 0, 0)
    if (this.gesture?.kind === 'stroke') {
      ctx.save()
      project(ctx)
      paintStroke(ctx, this.gesture.stroke, this.options.color ?? ink.pencil, false)
      ctx.restore()
    }
    if (this.options.overlay) {
      const top = overlay.getContext('2d')!
      top.clearRect(0, 0, width, height)
      top.save()
      project(top)
      const offset = this.offset ?? this.options.alignment
      if (offset) top.translate(offset.x, offset.y)
      for (const stroke of this.options.overlay) paintStroke(top, stroke, ink.reconstruct)
      top.restore()
    }
  }

  destroy() {
    this.finish()
    this.listeners.abort()
    this.observer.disconnect()
    cancelAnimationFrame(this.frame)
  }
}
