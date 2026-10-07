// The model, in the page: ClassCAD runs here as WebAssembly (buerli.io), loads handguard.ofb, and
// every change on the page is a change of the model's own parameters. The engine rebuilds the part
// (all 132 features of its history, a few seconds) and the page reads back what it built: the solid
// as it tessellated it, and the volume the price and the weight are made of.
//
// Changes are queued: while the engine rebuilds, only the latest wish waits; when it is done it goes
// on with that one. So a slider can be dragged as fast as a hand likes, and the part catches up.
//
// The session is buerli's (useBuerliCadFacade, in Session.jsx). Should it ever die (its drawing
// destroyed, its engine gone), the engine opens a session of its own, loads the model into it and
// builds the latest wish there: the page goes on where it was. A wish is never thrown away.
import { BuerliCadFacade } from '@buerli.io/classcad'
import { useShop } from './store'
import { PARAMS } from './design'
import { makeBody } from './three/body'

let session = null // { api, facade, drawingId, part }
let generation = 0 // the session the engine's work belongs to
let loaded = false // the model is in the session
let recovering = false // a new session is being opened
let built = null // the configuration the session's model has
let running = false // the engine is at work
let next = null // the latest wish, waiting
let final = false // that wish is one a hand has let go of (or a click): the one to show

const set = s => useShop.setState(s)
const pause = ms => new Promise(r => setTimeout(r, ms))

// (how a dead session answers: it is not connected, its drawing is gone)
const DEAD = /not connected|drawing id not set|connect\(\)|destroyed|reading 'api'|reading 'drawingId'/i
const lost = e => DEAD.test(String(e?.message ?? e))

// (while developing: a change here reloads the page)
if (import.meta.hot) import.meta.hot.decline()

// The session to work in: the model is loaded into it, and the latest wish built in it. (While the
// engine has a live session with the model in it, it keeps it.)
export function attach(cadApi, cadFacade, drawingId) {
  if (!drawingId || session?.drawingId === drawingId) return
  if (session && (loaded || recovering)) return
  session = { api: cadApi.v1, facade: cadFacade, drawingId, part: null }
  load(session)
}

// A dead session is replaced by one of the engine's own.
async function recover() {
  if (recovering) return
  recovering = true
  loaded = false
  set({ busy: true })
  console.warn('ClassCAD session lost: opening a new one')
  try {
    const facade = new BuerliCadFacade()
    await facade.connect('handguard-' + Date.now().toString(36))
    session = { api: facade.api.v1, facade, drawingId: facade.drawingId, part: null }
    await load(session)
  } catch (e) {
    console.error(e)
    set({ busy: false, error: `ClassCAD lost its session: ${e?.message ?? e}` })
  } finally {
    recovering = false
  }
}

async function load(s) {
  const gen = ++generation
  loaded = false
  const first = !useShop.getState().solved
  try {
    set(first ? { status: 'loading', note: 'Starting ClassCAD' } : { busy: true })
    // (the model, with its whole history, is 6.8 MB; it travels gzipped, 640 kB, and is unpacked here,
    // unless the server has already done it)
    const res = await fetch('/handguard.ofb.gz')
    if (!res.ok) throw new Error(`handguard.ofb could not be fetched (${res.status})`)
    const packed = new Uint8Array(await res.arrayBuffer())
    const data =
      packed[0] === 0x1f && packed[1] === 0x8b
        ? await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : packed.buffer
    if (first) set({ note: 'Loading handguard.ofb' })
    const { id } = await s.api.common.load({ data, format: 'OFB', doClear: true })
    if (gen !== generation) return
    s.part = id
    // the model's own parameters, as the file has them
    const solved = {}
    for (const name of PARAMS) solved[name] = (await s.api.part.getExpression({ id: s.part, name })).value
    built = solved
    if (first) {
      // the controls start where the model is
      set({ note: 'Building the part' })
      const r = await read(s)
      if (gen !== generation) return
      loaded = true
      set({ status: 'ready', want: solved, solved, ...r, error: null })
      if (next) run()
    } else {
      // the page goes on showing what it showed; the latest wish is built in the new session
      loaded = true
      next = next ?? useShop.getState().want
      run()
    }
  } catch (e) {
    if (gen !== generation) return
    console.error(e)
    if (lost(e) && !recovering) return recover()
    if (first) set({ status: 'error', error: e?.message ?? String(e) })
    else set({ busy: false, error: `ClassCAD lost its session: ${e?.message ?? e}` })
  }
}

// A wish: the controls' configuration. The engine catches up with the latest one. A click goes at
// once (`now`); a drag waits a moment (QUICK ms from its first move, however many follow), and a
// rebuild takes seconds: a slider swept across its track is one or two rebuilds, not a hundred.
const QUICK = 160
let timer = null
export function request(want, { now = false } = {}) {
  next = want
  final = now
  if (!loaded || running) return
  if (now) {
    clearTimeout(timer)
    timer = null
    run()
  } else if (!timer) {
    timer = setTimeout(() => {
      timer = null
      if (loaded && !running && next) run()
    }, QUICK)
  }
}

// A hand lets go of a slider: where it let go is final. A rebuild the engine is still busy with is
// out of date by then, and is not shown; the final one is built next, so the part changes once, to it.
export function release() {
  if (!next) return
  final = true
  if (!loaded || running) return
  clearTimeout(timer)
  timer = null
  run()
}

async function run() {
  if (running || !loaded) return
  running = true
  const s = session
  const gen = generation
  while (next && gen === generation) {
    const want = next
    next = null
    try {
      const began = performance.now()
      set({ busy: true, since: began })
      if (!(await rebuild(s, want))) continue
      // (how long it took: the next progress bar is drawn for that long)
      const took = useShop.getState().took * 0.4 + (performance.now() - began) * 0.6
      // (a hand has let go of a newer one meanwhile: this one is out of date, not read back nor shown)
      if (next && final) {
        set({ took })
        continue
      }
      const r = await read(s)
      if (gen !== generation) break
      if (next && final) continue
      set({ solved: { ...want }, ...r, took, error: null })
    } catch (e) {
      console.error(e)
      if (lost(e)) {
        // the session is gone: the wish waits for a new one
        next = next ?? want
        loaded = false
        running = false
        recover()
        return
      }
      // The engine would not build it. While the hand is still moving, the next wish is tried; once it
      // has let go, the controls go back to what the engine last built (and the model to it).
      built = null
      if (!next) {
        const solved = useShop.getState().solved
        set({ want: { ...solved }, error: `ClassCAD couldn't build that one: ${e?.message ?? e}` })
        next = solved
      }
    }
  }
  running = false
  set({ busy: false, since: null })
  // (a wish that came in while the last one was being read back)
  if (next && loaded && gen === generation) run()
}

// The model brought to a wish: its parameters set, the part rebuilt once.
async function rebuild(s, want) {
  const toUpdate = PARAMS.filter(k => want[k] !== built?.[k]).map(k => ({ name: k, value: want[k] }))
  if (!toUpdate.length) return false
  await s.api.part.updateExpression({ id: s.part, toUpdate })
  built = { ...want }
  return true
}

// What the engine built: the current solid (its faces and edges) and its volume.
async function read(s) {
  const tree = await s.facade.tree({ refresh: true })
  const solids = Object.values(tree).filter(n => n.class === 'CC_Solid' && !n.members?.consumed?.value)
  const ids = new Set(solids.flatMap(n => n.geometryIdList ?? []))
  const graphic = await s.facade.graphic()
  const containers = (graphic?.containers ?? []).filter(c => ids.has(c.id))
  const body = containers.length ? makeBody(containers) : null
  const mass = await s.api.part.calculateMassProperties({ id: s.part })
  return { body, volume: mass?.volume ?? null }
}
