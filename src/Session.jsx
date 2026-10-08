// The CAD session: buerli's, one drawing for the page. It is handed to the engine; if it is ever
// replaced by a new one, the engine loads the model into that one and goes on (src/engine.js).
// Should the session not open at all (no engine key for the page's address, no network), the page
// says so, and the rest of it stays.
import { Component, Suspense, useEffect } from 'react'
import { useBuerliCadFacade } from '@buerli.io/react'
import { attach } from './engine'
import { useShop } from './store'

function Connect() {
  const { api, facade, drawingId } = useBuerliCadFacade('handguard')
  useEffect(() => {
    attach(api, facade, drawingId)
  }, [api, facade, drawingId])
  return null
}

class Guard extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e) {
    const message = String(e?.message ?? e)
    useShop.setState({
      status: 'error',
      error: /drawing id not set|connect\(\)/i.test(message) ? 'The engine did not open a session for this page.' : message,
    })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function Session() {
  return (
    <Guard>
      <Suspense fallback={null}>
        <Connect />
      </Suspense>
    </Guard>
  )
}
