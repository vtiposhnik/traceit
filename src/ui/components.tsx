import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { ChevronDown, X, type LucideIcon } from 'lucide-react'
import { useImageUrl } from '../library/images'
import type { Reference } from '../library/reference'

export function IconButton({
  label,
  active,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={'icon-button ' + (active ? 'selected ' : '') + className}
      {...props}
    >
      {children}
    </button>
  )
}
export function Panel({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(true)
  const id = useId()
  return (
    <section className={'panel ' + className}>
      <h2>
        <button
          className="panel-heading"
          aria-controls={id}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon size={17} />
          <span>{title}</span>
          <ChevronDown className={open ? 'chevron' : 'chevron shut'} size={15} />
        </button>
      </h2>
      {open && (
        <div className="panel-content" id={id}>
          {children}
        </div>
      )}
    </section>
  )
}
export function Range({
  label,
  value,
  min = 0,
  max = 100,
  unit,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min?: number
  max?: number
  unit: string
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <label className="range-field">
      <span className="field-line">
        <span>{label}</span>
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        style={{ '--range-fill': ((value - min) * 100) / (max - min) + '%' } as CSSProperties}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
export function Toggle({ label, on, change }: { label: string; on: boolean; change: () => void }) {
  return (
    <button className="toggle-line" type="button" role="switch" aria-checked={on} onClick={change}>
      <span>{label}</span>
      <span className={'switch ' + (on ? 'on' : '')} aria-hidden="true">
        <i />
      </span>
    </button>
  )
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current!
    const prior = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (prior instanceof HTMLElement && prior.isConnected) prior.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'modal-wide' : '')}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current!.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            onClose()
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  )
}
export function ReferenceThumb({
  item,
  className = '',
  lazy = false,
}: {
  item: Reference
  className?: string
  lazy?: boolean
}) {
  const src = useImageUrl(item)
  return (
    <img
      src={src}
      alt={item.title}
      draggable={false}
      loading={lazy ? 'lazy' : 'eager'}
      className={'reference-thumb ' + className}
    />
  )
}
