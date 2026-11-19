import { useLayoutEffect, useRef, type RefObject } from 'react'
import { ink, logicalSize, type Stroke } from '../drawing/model'
import { drawPlate } from '../drawing/render'
import type { SurfaceHandle } from '../drawing/Surface'
import type { Reference } from '../library/reference'

export const transferTime = 300
export function Transfer({
  from,
  target,
  strokes,
  reference,
}: {
  from: DOMRect
  target: RefObject<SurfaceHandle | null>
  strokes: Stroke[]
  reference: Reference
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current!
    const to = target.current?.paperBox()
    if (!to || !from.width || !from.height) return
    const size = logicalSize(reference.width, reference.height)
    canvas.width = Math.ceil(size.width)
    canvas.height = Math.ceil(size.height)
    drawPlate(canvas, strokes, size.width, size.height, ink.pencil)
    Object.assign(canvas.style, {
      left: from.left + 'px',
      top: from.top + 'px',
      width: from.width + 'px',
      height: from.height + 'px',
    })
    const animation = canvas.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        {
          transform:
            'translate(' +
            (to.left - from.left) +
            'px,' +
            (to.top - from.top) +
            'px) scale(' +
            to.width / from.width +
            ',' +
            to.height / from.height +
            ')',
        },
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : transferTime,
        easing: 'cubic-bezier(.36,.08,.22,1)',
        fill: 'forwards',
      },
    )
    return () => animation.cancel()
  }, [from, target, strokes, reference])
  return <canvas className="transfer-sheet" ref={ref} aria-label="Moving tracing to reference panel" />
}
