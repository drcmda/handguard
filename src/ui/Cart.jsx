// The cart: what was ordered, each part as configured, and the way to buy them (not open yet: the
// button only shakes its head).
import { useState } from 'react'
import { useShop } from '../store'
import { chf, counts, finishOf, inch } from '../design'

// a part, small, seen from its left, in its finish, from the model's own numbers (in mm, one scale for
// every length: a longer part is a longer drawing): the outline with the rail's slots, the keel and
// the shovel nose; the faces' edges, the Picatinny up front with its QD pad, the rear QD ring, the
// M-LOK slots on the side and on the diagonals, the holes in the boss, the clamp screws
const W = 420
const range = (n, x0, step) => Array.from({ length: Math.max(0, n) }, (_, i) => x0 + i * step)
function Thumb({ id, config, finish }) {
  const g = counts(config).at
  const [L, Lrail, ao, aoR, rt, picH, pitch, slotW, slotD] = [
    'L',
    'Lrail',
    'ao',
    'aoR',
    'rt',
    'picH',
    'picPitch',
    'picSlotW',
    'picSlotD',
  ].map(g)
  const [ft, fe, kx, kb, kr] = ['thickEnd', 'fC2X', 'xk', 'keelBot', 'keelRR'].map(g)
  const seg = g('segStart'),
    low = ao + picH,
    mid = (a, b) => (a + b) / 2
  const color = finishOf(finish).color
  const ink = '#07080a'
  // (y is down the page: a height z on the part is -z here)
  const outline = [
    `M0 ${-rt}H${Lrail}V${g('noseBreak')}L${L} ${low}H${seg + g('frontRamp')}L${seg} ${ao}H${fe}`,
    `C${mid(fe, ft)} ${ao} ${mid(fe, ft)} ${aoR} ${ft} ${aoR}`,
    `C${mid(ft, kx)} ${aoR} ${mid(ft, kx)} ${kb} ${kx} ${kb}H${kr}Q0 ${kb} 0 ${kb - kr}Z`,
  ].join('')
  const edge = (y, x0, x1, o = 0.55) => <path d={`M${x0} ${y}H${x1}`} stroke={ink} strokeWidth="0.7" opacity={o} />
  const slot = (x, y, w, h, r = 0) => (
    <rect key={`${x} ${y}`} x={x - w / 2} y={y - h / 2} width={w} height={h} rx={r} fill={ink} />
  )
  const mlok = g('mlokPitch')
  const ah = g('picMaxHalf')
  return (
    <svg
      viewBox={`-4 ${-rt - 3} ${W + 8} ${rt + kb + 6}`}
      className="thumb"
      preserveAspectRatio="xMinYMid meet"
      aria-hidden>
      <defs>
        <clipPath id={`thumb-${id}`}>
          <path d={outline} />
        </clipPath>
      </defs>
      <path d={outline} fill={color} />
      <g clipPath={`url(#thumb-${id})`}>
        {/* the faces' edges: the rail's base and flanks, the boss, the octagon, the thick rear */}
        {edge(-g('railBase'), 0, Lrail, 0.8)}
        {edge(-g('picZ2'), 0, Lrail, 0.35)}
        {edge(-g('bossWallBot'), fe, L)}
        {edge(-g('ao_t'), fe, L)}
        {edge(g('ao_t'), fe, L)}
        {edge(-g('keelHalf'), 0, ft)}
        {edge(g('keelHalf'), 0, ft)}
        {edge(ao, seg, L)}
        {/* the rail's slots, the bottom rail's, as notches */}
        {range(g('nTop'), g('xg0'), pitch).map(x => (
          <rect
            key={x}
            x={x - slotW / 2}
            y={-rt - 1}
            width={slotW}
            height={slotD + 1}
            style={{ fill: 'var(--panel)' }}
          />
        ))}
        {range(config.frontPicSlots, g('xf0B'), pitch).map(x => (
          <rect
            key={x}
            x={x - slotW / 2}
            y={low - slotD}
            width={slotW}
            height={slotD + 1}
            style={{ fill: 'var(--panel)' }}
          />
        ))}
        {/* M-LOK on the side, and on the diagonals (seen at 45°) */}
        {range(g('nA'), g('xA0'), mlok).map(x => slot(x, 0, 32, 7, 2.4))}
        {range(g('nB'), g('xB0'), mlok).map(x => slot(x, mid(g('ao_t'), ao), 32, 5, 1.7))}
        {range(g('nB'), g('xB0'), mlok).map(x =>
          slot(x, -(mid(g('ao_t'), ao) - g('dUpper') * Math.SQRT1_2), 32, 5, 1.7),
        )}
        {/* the clamp screws' counterbores */}
        {range(2, g('screwX1'), g('screwSpacing')).map(x => (
          <circle key={x} cx={x} cy={g('screwZ')} r={g('cbDia') / 2} fill={ink} />
        ))}
        {/* the Picatinny at 3 o'clock: its slots up front, the QD pad behind them */}
        <rect x={seg} y={-ah} width={L - seg + 2} height={2 * ah} fill={color} stroke={ink} strokeWidth="0.8" />
        <rect x={seg} y={-ah} width={L - seg + 2} height={2 * ah} fill="#fff" opacity="0.06" />
        {edge(-g('picTopHalf'), seg, L, 0.4)}
        {edge(g('picTopHalf'), seg, L, 0.4)}
        {range(g('nFrontOpen'), g('xf0open'), pitch).map(x => slot(x, 0, slotW, 2 * ah))}
        <circle cx={g('xQdF')} cy="0" r={g('qdBore') / 2} fill={ink} />
        {/* the rear QD socket in its ring */}
        <circle cx={g('qdRearX')} cy="0" r={g('qdPadR')} fill={color} stroke={ink} strokeWidth="0.8" />
        <circle cx={g('qdRearX')} cy="0" r={g('qdBore') / 2} fill={ink} />
      </g>
      <path d={outline} fill="none" stroke={ink} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function Buy({ disabled }) {
  const [shake, setShake] = useState(0)
  return (
    <button
      key={shake}
      className={'buy' + (shake ? ' shake' : '')}
      disabled={disabled}
      onClick={() => setShake(n => n + 1)}>
      <span>Buy</span>
      <i>→</i>
    </button>
  )
}

export function Cart() {
  const open = useShop(s => s.cartOpen)
  const cart = useShop(s => s.cart)
  const setQty = useShop(s => s.setQty)
  const close = () => useShop.getState().openCart(false)
  const count = cart.reduce((a, i) => a + i.qty, 0)
  const total = cart.reduce((a, i) => a + i.qty * i.price, 0)
  return (
    <div className={'cart-layer' + (open ? ' open' : '')} aria-hidden={!open}>
      <div className="scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-label="Cart">
        <header>
          <b>Cart</b>
          <small>
            {count} {count === 1 ? 'part' : 'parts'}
          </small>
          <button className="x" onClick={close} aria-label="Close the cart">
            ×
          </button>
        </header>
        {cart.length === 0 ? (
          <div className="empty">
            <b>Nothing in it yet.</b>
            <span>Size one, rail one, order one.</span>
          </div>
        ) : (
          <ul className="items">
            {cart.map(i => {
              const n = counts(i.config)
              const f = finishOf(i.finish)
              return (
                <li key={i.key}>
                  <Thumb id={i.key.replace(/\W/g, '')} config={i.config} finish={i.finish} />
                  <div className="what">
                    <b>AR-15 handguard · {inch(i.config.lengthIn)}</b>
                    <span>
                      {n.top} top slots · {i.config.frontPicSlots} up front · {n.mlok} M-LOK · 4 QD
                    </span>
                    <span>
                      nose {i.config.noseExtIn}″ · rear flow R {i.config.flowRIn}″ · {f.word} {f.process}
                    </span>
                    <div className="qty">
                      <button onClick={() => setQty(i.key, i.qty - 1)} aria-label="One less">
                        −
                      </button>
                      <span>{i.qty}</span>
                      <button onClick={() => setQty(i.key, i.qty + 1)} aria-label="One more">
                        +
                      </button>
                    </div>
                  </div>
                  <div className="sum">
                    <b>{chf(i.qty * i.price)}</b>
                    <button className="rm" onClick={() => setQty(i.key, 0)}>
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <footer>
          <div className="line">
            <span>Shipping</span>
            <span>free</span>
          </div>
          <div className="line total">
            <span>Total</span>
            <span>
              <small>CHF</small> <b>{chf(total)}</b>
            </span>
          </div>
          <Buy disabled={!cart.length} />
          <small className="note">Each part is machined from your own configuration of handguard.ofb.</small>
        </footer>
      </aside>
    </div>
  )
}
