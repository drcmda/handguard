// The configurator: a control for each of the model's parameters, what the part comes to have (its
// slots, from the model's own formulas, at once), the price, and the order. Every change goes to the
// model (engine.request); the engine rebuilds the part, and the price and the weight follow its volume.
import { useEffect, useRef, useState } from 'react'
import { useShop } from '../store'
import { release, request } from '../engine'
import {
  FINISHES,
  FLOWS,
  LENGTH_STEP,
  NOSES,
  PARAMS,
  RANGE,
  chf,
  counts,
  finishOf,
  grams,
  inch,
  maxFront,
  minLength,
  ounces,
  priceOf,
  sound,
} from '../design'

// a control's change: a click goes to the engine at once, a drag after a moment
const change = (key, value, now = true) => {
  const want = { ...useShop.getState().want, [key]: value }
  useShop.setState({ want, touch: { key, at: performance.now() } })
  request(want, { now })
}

// a row lights up for a moment after it was changed
function useHot(key) {
  const touch = useShop(s => s.touch)
  const [hot, setHot] = useState(false)
  useEffect(() => {
    if (touch?.key !== key) return
    setHot(true)
    const t = setTimeout(() => setHot(false), 900)
    return () => clearTimeout(t)
  }, [touch, key])
  return hot
}

function Row({ k, name, value, children, className = '' }) {
  const hot = useHot(k)
  return (
    <div className={`crow ${className}${hot ? ' hot' : ''}`}>
      <div className="name">{name}</div>
      <div className="val">{value}</div>
      {children}
    </div>
  )
}

// a slider. `lo`: below it the configuration does not go (the track is striped there); `building`:
// the engine is still building this value (the fill's stripes run)
function Slider({ value, min, max, lo = min, step = 1, onChange, disabled, label, building }) {
  const ref = useRef()
  const k = (value - min) / (max - min)
  const set = (v, drag = false) => {
    v = Math.max(lo, Math.min(max, Math.round(v / step) * step))
    if (v !== value) onChange(v, drag)
  }
  const from = (e, drag) => {
    const r = ref.current.getBoundingClientRect()
    set(min + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (max - min), drag)
  }
  const ticks = Math.round((max - min) / step)
  return (
    <div
      ref={ref}
      className={'track' + (disabled ? ' off' : '') + (building ? ' building' : '')}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={lo}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={e => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        from(e, true)
      }}
      onPointerMove={e => e.currentTarget.hasPointerCapture(e.pointerId) && from(e, true)}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={e => {
        const d = (e.shiftKey ? 4 : 1) * step
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(value + d)
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(value - d)
        else return
        e.preventDefault()
      }}>
      {lo > min && (
        <i
          className="lo"
          style={{ width: `${((lo - min) / (max - min)) * 100}%` }}
          title="Too short for this many slots up front"
        />
      )}
      <i className="fill" style={{ width: `${k * 100}%` }} />
      <span className="ticks">
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <i key={i} style={{ left: `${(i / ticks) * 100}%` }} className={(min + i * step) % 1 === 0 ? 'whole' : ''} />
        ))}
      </span>
      <b className="knob" style={{ left: `${k * 100}%` }} />
    </div>
  )
}

// a row of choices, each a word and its number
function Chips({ k, options, value, disabled, format }) {
  const want = useShop(s => s.want)
  return (
    <div className="chips">
      {options.map(o => (
        <button
          key={o.value}
          className={'chip' + (o.value === value ? ' on' : '')}
          disabled={disabled || !sound({ ...want, [k]: o.value })}
          title={sound({ ...want, [k]: o.value }) ? undefined : 'Not with this length and these slots'}
          onClick={() => change(k, o.value)}>
          <b>{o.label}</b>
          <span>{format(o.value)}</span>
        </button>
      ))}
    </div>
  )
}

// the rebuild under way: a bar that runs as long as the last rebuilds took
function Progress() {
  const busy = useShop(s => s.busy)
  const since = useShop(s => s.since)
  const took = useShop(s => s.took)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!busy) return
    let raf = requestAnimationFrame(function loop() {
      tick(n => n + 1)
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  }, [busy])
  const k = busy && since != null ? 1 - Math.exp(-((performance.now() - since) / took) * 2.2) : 0
  return (
    <div className={'progress' + (busy ? ' on' : '')} aria-hidden>
      <i style={{ transform: `scaleX(${k.toFixed(4)})` }} />
    </div>
  )
}

function Order() {
  const status = useShop(s => s.status)
  const [state, setState] = useState('idle')
  const [press, setPress] = useState(false)
  const order = () => {
    if (state !== 'idle' || status !== 'ready') return
    setState('busy')
    // when the engine has caught up with what the controls show, the part goes in the cart as built
    const add = () => {
      const s = useShop.getState()
      if (s.busy || PARAMS.some(k => s.want[k] !== s.solved?.[k]) || s.volume == null) return setTimeout(add, 120)
      s.addToCart({
        key: JSON.stringify([PARAMS.map(k => s.solved[k]), s.finish]),
        config: { ...s.solved },
        finish: s.finish,
        volume: s.volume,
        price: priceOf(s.volume, s.finish),
      })
      setState('done')
      setTimeout(() => useShop.getState().openCart(true), 650)
      setTimeout(() => setState('idle'), 2000)
    }
    setTimeout(add, 300)
  }
  return (
    <button
      className={'order ' + state + (press ? ' press' : '')}
      disabled={status !== 'ready'}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      onClick={order}>
      <span>{state === 'busy' ? 'Ordering…' : state === 'done' ? 'In your cart' : 'Order'}</span>
      <i>{state === 'done' ? '✓' : state === 'busy' ? '' : '→'}</i>
    </button>
  )
}

export function Card() {
  const want = useShop(s => s.want)
  const status = useShop(s => s.status)
  const busy = useShop(s => s.busy)
  const finish = useShop(s => s.finish)
  const volume = useShop(s => s.volume)
  const solved = useShop(s => s.solved)
  const error = useShop(s => s.error)
  const ready = status === 'ready'
  const lo = minLength(want)
  const most = maxFront(want)
  const n = counts(want)
  const price = volume != null ? priceOf(volume, finish) : null
  // (the price lights up for a moment when it moves)
  const [priceHot, setPriceHot] = useState(false)
  const shown = useRef(price)
  useEffect(() => {
    if (price == null || shown.current === price) return
    shown.current = price
    setPriceHot(true)
    const t = setTimeout(() => setPriceHot(false), 700)
    return () => clearTimeout(t)
  }, [price])
  const f = finishOf(finish)
  return (
    <aside className={'card' + (ready ? '' : ' wait')} id="configure">
      <div className="chead">
        <span>Configure</span>
        <i className={'live' + (busy ? ' busy' : '')} />
        <small>{!ready ? (status === 'error' ? 'offline' : 'starting') : busy ? 'rebuilding' : 'live'}</small>
        <Progress />
      </div>
      <Row
        k="lengthIn"
        name="Length"
        value={
          <>
            <b>{inch(want.lengthIn)}</b> {Math.round(n.L)} mm
          </>
        }
        className="r-slider">
        <Slider
          label="Length"
          value={want.lengthIn}
          min={RANGE.lengthIn[0]}
          max={RANGE.lengthIn[1]}
          lo={lo}
          step={LENGTH_STEP}
          disabled={!ready}
          building={busy && solved?.lengthIn !== want.lengthIn}
          onChange={(v, drag) => change('lengthIn', v, !drag)}
        />
      </Row>
      <Row
        k="frontPicSlots"
        name="Picatinny up front"
        value={
          <>
            <b>{want.frontPicSlots}</b> slots
          </>
        }
        className="r-steps">
        <div className="stepper">
          <button
            className="b"
            disabled={!ready || want.frontPicSlots <= RANGE.frontPicSlots[0]}
            onClick={() => change('frontPicSlots', want.frontPicSlots - 1)}
            aria-label="Fewer slots">
            −
          </button>
          <span className="num">{want.frontPicSlots}</span>
          <button
            className="b"
            disabled={!ready || want.frontPicSlots >= most}
            onClick={() => change('frontPicSlots', want.frontPicSlots + 1)}
            aria-label="More slots"
            title={want.frontPicSlots >= most ? 'As many as this length takes' : undefined}>
            +
          </button>
        </div>
        <div className="dots">
          {Array.from({ length: RANGE.frontPicSlots[1] }, (_, i) => (
            <i key={i} className={i < want.frontPicSlots ? 'on' : i >= most ? 'no' : ''} />
          ))}
        </div>
      </Row>
      <Row
        k="noseExtIn"
        name="Shovel nose"
        value={
          <>
            <b>{want.noseExtIn}″</b> out
          </>
        }
        className="r-chips">
        <Chips k="noseExtIn" options={NOSES} value={want.noseExtIn} disabled={!ready} format={v => `${v}″`} />
      </Row>
      <Row
        k="flowRIn"
        name="Rear flow"
        value={
          <>
            <b>R {want.flowRIn}″</b>
          </>
        }
        className="r-chips">
        <Chips k="flowRIn" options={FLOWS} value={want.flowRIn} disabled={!ready} format={v => `R ${v}″`} />
      </Row>
      <Row
        k="finish"
        name="Finish"
        value={
          <>
            <b>{f.label}</b> {f.process}
          </>
        }
        className="r-finish">
        <div className="swatches">
          {FINISHES.map(x => (
            <button
              key={x.key}
              className={'sw' + (x.key === finish ? ' on' : '')}
              onClick={() => useShop.getState().setFinish(x.key)}
              aria-label={x.word}
              title={`${x.word}, ${x.process}`}>
              <i style={{ background: x.swatch }} />
              <span>{x.label}</span>
            </button>
          ))}
        </div>
      </Row>
      <div className="facts">
        <span>
          <b>{n.top}</b> top slots
        </span>
        <span>
          <b>{n.mlok}</b> M-LOK
        </span>
        <span>
          <b>4</b> QD
        </span>
        <span>
          <b>{volume != null ? Math.round(grams(volume)) : '—'}</b> g{' '}
          <small>{volume != null ? `${ounces(volume).toFixed(1)} oz` : ''}</small>
        </span>
      </div>
      <div className="buybar">
        <div className={'price' + (busy ? ' pending' : '') + (priceHot ? ' hot' : '')}>
          <span className="cur">CHF</span>
          {price != null ? <b>{chf(price)}</b> : <b className="skel" aria-label="The price, once the part is built" />}
          <small>6061-T6, machined, ships in 5 days</small>
        </div>
        <Order />
      </div>
      {error && ready && <div className="err">{error}</div>}
    </aside>
  )
}
