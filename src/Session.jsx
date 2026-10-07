// The CAD session: buerli's, one drawing for the page. It is handed to the engine; if it is ever
// replaced by a new one, the engine loads the model into that one and goes on (src/engine.js).
import { Suspense, useEffect } from 'react'
import { useBuerliCadFacade } from '@buerli.io/react'
import { attach } from './engine'

function Connect() {
  const { api, facade, drawingId } = useBuerliCadFacade('handguard')
  useEffect(() => {
    attach(api, facade, drawingId)
  }, [api, facade, drawingId])
  return null
}

export function Session() {
  return (
    <Suspense fallback={null}>
      <Connect />
    </Suspense>
  )
}
