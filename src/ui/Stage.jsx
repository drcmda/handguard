// The part's room: the part, and, on narrower screens, behind it, what is being changed. On phones
// and tablets it stays at the top of the screen while the controls scroll under it. While the engine
// starts, the part's own first sketch draws itself here (the rail's head, its boss, the octagon, the
// barrel nut inside), and the engine's steps tick off. While it rebuilds, a line says so.
import { useEffect, useMemo, useState } from 'react'
import { useShop } from '../store'
import PROFILE from '../model/profile.json'
import { Giant } from './Giant'
import { useTouched } from './touched'
import { View } from '../three/View'

const STEPS = ['Starting ClassCAD', 'Loading handguard.ofb', 'Building the part']
const NUT = 17.4625 // the barrel nut's radius (1.375″ across)

// a line of the drawing: when it starts to be drawn, and how long it is (it is drawn in along its length)
const ln = (i, length) => {
  const len = length.toFixed(2)
  return { '--i': i, '--len': len, strokeDasharray: `${len} ${len}` }
}

// The handguard seen from its rear, as its first sketch draws it: the outline a line after another,
// then the barrel nut in red; over and over.
function Drawing() {
  const segs = useMemo(
    () => PROFILE.segments.map(([a, b]) => ({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) })),
    [],
  )
  return (
    <svg className="drawing" viewBox="-30 -36 60 64" aria-hidden>
      <g transform="scale(1,-1)">
        {segs.map(({ a, b, len }, i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="ln ink" style={ln(i * 0.22, len)} />
        ))}
        <circle r={NUT} className="ln red" style={ln(segs.length * 0.22 + 0.3, 2 * Math.PI * NUT)} />
        <circle r="0.9" className="ln dot" style={ln(segs.length * 0.22 + 0.2, 6)} />
      </g>
    </svg>
  )
}

function Loader() {
  const status = useShop(s => s.status)
  const note = useShop(s => s.note)
  const error = useShop(s => s.error)
  // (it fades away once the part is there)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (status !== 'ready') return setGone(false)
    const t = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(t)
  }, [status])
  if (gone) return null
  if (status === 'error') {
    return (
      <div className="status err">
        <b>ClassCAD couldn't start</b>
        <span>{error}</span>
        <small>The engine's key is only issued on the shop's own domain and on localhost.</small>
      </div>
    )
  }
  const at = status === 'ready' ? STEPS.length : Math.max(0, STEPS.indexOf(note))
  return (
    <div className={'loader' + (status === 'ready' ? ' out' : '')}>
      <Drawing />
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''}>
            <i />
            {s}
          </li>
        ))}
      </ol>
      <small>ClassCAD runs right here in your browser. The first visit downloads the engine.</small>
    </div>
  )
}

export function Stage() {
  const ready = useShop(s => s.status === 'ready')
  const busy = useShop(s => s.busy)
  const touched = useTouched()
  return (
    <section className="stage">
      <Giant k={touched} />
      <div className={'room' + (ready ? ' in' : '')}>
        <View />
      </div>
      <Loader />
      {ready && (
        <div className={'hint' + (busy ? ' busy' : '')}>{busy ? 'Rebuilding the part' : 'Drag to turn it'}</div>
      )}
    </section>
  )
}
