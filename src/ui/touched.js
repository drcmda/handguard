// what a hand has just changed, for a moment after it did (null once the moment is over, or while the
// sketch is open)
import { useEffect, useState } from 'react'
import { useShop } from '../store'

export function useTouched(ms = 1500) {
  const touch = useShop(s => s.touch)
  const sketchOpen = useShop(s => s.sketchOpen)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!touch) return
    setOn(true)
    const t = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(t)
  }, [touch, ms])
  return on && !sketchOpen ? touch.key : null
}
