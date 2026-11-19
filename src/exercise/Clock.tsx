import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import { formatTime, stageTime, type Exercise } from './engine'

export function Clock({ exercise }: { exercise: Exercise }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    setNow(performance.now())
    if (exercise.runningSince === null) return
    const tick = window.setInterval(() => setNow(performance.now()), 180)
    return () => clearInterval(tick)
  }, [exercise.runningSince])
  const seconds = Math.ceil(exercise.config.seconds - stageTime(exercise, now) / 1000)
  return (
    <span className={'clock ' + (seconds <= 10 ? 'low-time' : '')} role="timer" aria-label="Time remaining">
      <Timer size={15} />
      {formatTime(seconds)}
    </span>
  )
}
