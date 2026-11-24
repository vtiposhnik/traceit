import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { SurfaceEngine, type SurfaceOptions } from './surface-engine'

import type { View } from './model'

export interface SurfaceHandle {
  finish(): void
  fit(): void
  zoom(value: number): void
  sheetView(): View | undefined
  setSheetView(view: View): void
  paperBox(): DOMRect | undefined
}
interface Props extends SurfaceOptions {
  image?: string
  imageOpacity?: number
  adaptive?: boolean
  baseOpacity?: number
  overlayOpacity?: number
  label: string
}
export const Surface = forwardRef<SurfaceHandle, Props>(function Surface(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const engine = useRef<SurfaceEngine | null>(null)
  useLayoutEffect(() => {
    const instance = new SurfaceEngine(
      {
        host: host.current!,
        paper: paper.current!,
        base: base.current!,
        overlay: overlay.current!,
        cursor: cursor.current!,
      },
      props,
    )
    engine.current = instance
    return () => {
      instance.destroy()
      engine.current = null
    }
    // The engine stays attached during strokes. The next layout effect refreshes its inputs.
  }, [])
  useLayoutEffect(() => {
    engine.current?.update(props)
  })
  useImperativeHandle(
    ref,
    () => ({
      finish: () => engine.current?.finish(),
      fit: () => engine.current?.fit(),
      zoom: (value) => engine.current?.setZoom(value),
      sheetView: () => engine.current?.sheetView(),
      setSheetView: (view) => engine.current?.setSheetView(view),
      paperBox: () => engine.current?.paperBox(),
    }),
    [],
  )
  return (
    <div
      ref={host}
      className={
        'surface ' + (props.variant ?? 'desk') + ' tool-' + props.tool + (props.adaptive ? ' adaptive' : '')
      }
      role="application"
      aria-label={props.label}
      tabIndex={0}
      style={{ '--image-opacity': props.imageOpacity ?? 1 } as CSSProperties}
    >
      <div className="paper" ref={paper}>
        {props.image && <img className="reference-photo" src={props.image} alt="" draggable={false} />}
        {(props.variant ?? 'desk') === 'desk' && (
          <div className="registration" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      <canvas ref={base} className="ink-layer" style={{ opacity: props.baseOpacity ?? 1 }} />
      <canvas
        ref={overlay}
        className="overlay-layer"
        style={{ display: props.overlay ? 'block' : 'none', opacity: props.overlayOpacity ?? 1 }}
      />
      <div ref={cursor} className="brush-cursor" />
    </div>
  )
})
