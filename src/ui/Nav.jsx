// The nav: the shop's name and what it sells, its pages (one so far), and the cart with its count.
import { useEffect, useRef, useState } from 'react'
import { useShop } from '../store'

export function Nav() {
  const count = useShop(s => s.cart.reduce((a, i) => a + i.qty, 0))
  const openCart = useShop(s => s.openCart)
  // the count gives a little hop when something is added
  const [hop, setHop] = useState(false)
  const prev = useRef(count)
  useEffect(() => {
    if (count > prev.current) {
      setHop(true)
      const t = setTimeout(() => setHop(false), 450)
      prev.current = count
      return () => clearTimeout(t)
    }
    prev.current = count
  }, [count])
  return (
    <nav className="nav">
      <div className="brand">
        <a className="logo" href="/">
          <i className="cube" />
          <span>handguard.parts</span>
        </a>
        <span className="kick">
          MIL-STD-1913 M-LOK handguard<span className="more">· made to order</span>
        </span>
      </div>
      <div className="links">
        <a className="on" href="#configure">
          Configure
        </a>
        <span title="Soon">Specs</span>
        <span title="Soon">Shipping</span>
        <span title="Soon">Contact</span>
      </div>
      <button className={'cart' + (hop ? ' hop' : '')} onClick={() => openCart(true)}>
        <span>Cart</span>
        <b>{count}</b>
      </button>
    </nav>
  )
}
