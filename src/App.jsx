// handguard.parts: a shop for one part, an AR-15 handguard made to order. The page is the shop (the
// nav, the part with what it has under it, the configurator, the footer); the part is the real model,
// rebuilt by ClassCAD in the page at every change.
import { useEffect } from 'react'
import { Session } from './Session'
import { useShop } from './store'
import { PARAMS } from './design'
import { Nav } from './ui/Nav'
import { Specs } from './ui/Specs'
import { Card } from './ui/Card'
import { Stage } from './ui/Stage'
import { Cart } from './ui/Cart'

export function App() {
  const cartOpen = useShop(s => s.cartOpen)
  // (no scrolling the page behind the open cart)
  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : ''
  }, [cartOpen])
  return (
    <div className="page">
      <Session />
      <Nav />
      <main className="main">
        <div className="view">
          <Stage />
          <Specs />
        </div>
        <Card />
      </main>
      <footer className="foot">
        <span className="ofb">
          <i className="cube" />
          handguard.ofb · {PARAMS.length} parameters · MIL-STD-1913 · M-LOK
        </span>
        <span className="made">
          Rebuilt live by{' '}
          <a href="https://classcad.ch" target="_blank" rel="noreferrer">
            ClassCAD
          </a>
          , in your browser
        </span>
      </footer>
      <Cart />
    </div>
  )
}
