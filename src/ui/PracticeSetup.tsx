import { useState } from 'react'
import { ArrowRight, Check, Infinity as InfinityIcon, Contrast, Timer } from 'lucide-react'
import { Modal, ReferenceThumb } from './components'
import { modeLabels, type PracticeConfig } from '../exercise/engine'
import { sourceNames, type Reference } from '../library/reference'

const modes = [
  { mode: 'free', icon: InfinityIcon, description: 'Move through each stage at your own pace.' },
  { mode: 'timed', icon: Timer, description: 'Use the same time limit for both drawings.' },
  { mode: 'value', icon: Contrast, description: 'Paint light, middle, and dark shapes beside a reference. No timer.' },
] as const

export function PracticeSetup({
  reference,
  initial,
  replacing,
  onClose,
  start,
}: {
  reference: Reference
  initial: PracticeConfig
  replacing: boolean
  onClose: () => void
  start: (config: PracticeConfig) => void
}) {
  const [mode, setMode] = useState(initial.mode)
  const [seconds, setSeconds] = useState(String(initial.seconds))
  const [custom, setCustom] = useState(![30, 60, 120, 300].includes(initial.seconds))
  const validDuration = Number.isInteger(Number(seconds)) && Number(seconds) >= 1 && Number(seconds) <= 3600
  const valid = mode !== 'timed' || validDuration
  return (
    <Modal title="Set up practice" onClose={onClose}>
      <div className="setup-reference">
        <ReferenceThumb item={reference} />
        <div>
          <small>{sourceNames[reference.source]}</small>
          <h3>{reference.title}</h3>
        </div>
      </div>
      <fieldset className="mode-options">
        <legend>Practice mode</legend>
        {modes.map(({ mode: m, icon: Icon, description }) => (
          <label key={m} className={mode === m ? 'mode-card chosen' : 'mode-card'}>
            <input type="radio" name="practice-mode" checked={mode === m} onChange={() => setMode(m)} />
            <Icon />
            <span>
              <strong>{modeLabels[m]}</strong>
              <small>{description}</small>
            </span>
            <i>{mode === m && <Check size={12} />}</i>
          </label>
        ))}
      </fieldset>
      {mode === 'timed' && (
        <div className="time-setup">
          <span className="field-title">Time per drawing stage</span>
          <div className="preset-group">
            {[
              [30, '30 sec'],
              [60, '60 sec'],
              [120, '2 min'],
              [300, '5 min'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={!custom && seconds === String(value) ? 'chosen' : ''}
                onClick={() => {
                  setCustom(false)
                  setSeconds(String(value))
                }}
              >
                {label}
              </button>
            ))}
            <button className={custom ? 'chosen' : ''} onClick={() => setCustom(true)}>
              Custom
            </button>
          </div>
          {custom && (
            <label className="custom-time">
              Seconds per stage{' '}
              <input
                type="number"
                min="1"
                max="3600"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
          )}
        </div>
      )}
      {replacing && (
        <p className="dialog-note">Starting a new practice replaces the exercise currently on your desk.</p>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!valid}
          onClick={() => start({ mode, seconds: validDuration ? Number(seconds) : 60 })}
        >
          Start practice <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  )
}
