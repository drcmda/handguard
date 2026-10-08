// (a timing bench for the model in the browser: load, and a rebuild for each test value)
import { init, WASMClient, BuerliCadFacade } from '@buerli.io/classcad'
const wasm = new URLSearchParams(location.search).get('wasm')
init(id => new WASMClient(id, { token: import.meta.env.VITE_CLASSCAD_TOKEN, ...(wasm && { url: `/wasm/${wasm}` }) }))
const out = (window.bench = [])
const log = (...a) => {
  out.push(a.join(' '))
  document.getElementById('log').textContent = out.join('\n')
}
const tests =
  new URLSearchParams(location.search)
    .get('t')
    ?.split(',')
    .map(s => s.split(':')) ?? []
;(async () => {
  try {
    let t = performance.now()
    const facade = new BuerliCadFacade()
    await facade.connect('bench')
    const api = facade.api.v1
    log('connect', Math.round(performance.now() - t))
    // (?emit=: what the engine sends back after each command; lean keeps only the part's own graphic)
    const EMIT = {
      lean: { sendStructure: false, sendGraphic_Invisible: false, sendGraphic_Sketch: false, sendGraphic_StructureObj: false, sendMessages: false },
      bare: { sendStructure: false, sendGraphic_Kernel: false, sendGraphic_Invisible: false, sendGraphic_Sketch: false, sendGraphic_StructureObj: false, sendMessages: false },
    }
    const emit = new URLSearchParams(location.search).get('emit')
    const after = new URLSearchParams(location.search).has('after')
    const setEmit = async () => {
      t = performance.now()
      const cfg = await BuerliCadFacade.utils.setEmissionConfig(facade.drawingId, EMIT[emit])
      log('emission', Math.round(performance.now() - t), JSON.stringify(cfg))
    }
    if (emit && !after) await setEmit()
    t = performance.now()
    const packed = new Uint8Array(
      await (await fetch('/' + (new URLSearchParams(location.search).get('ofb') ?? 'handguard.ofb.gz'))).arrayBuffer(),
    )
    const data =
      packed[0] === 0x1f && packed[1] === 0x8b
        ? await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : packed.buffer
    const { id } = await api.common.load({ data, format: 'OFB', doClear: true })
    log('load', Math.round(performance.now() - t))
    const facet = new URLSearchParams(location.search).get('facet')
    if (facet) {
      const [c, a] = facet.split(',').map(Number)
      await api.common.setFacetingParameters({ chordHeightTol: c, angleTol: a ?? 0 })
      log('faceting', JSON.stringify(await api.common.getFacetingParameters()))
    }
    const measure = async label => {
      let t1 = performance.now()
      const tree = await facade.tree({ refresh: true })
      const tt = Math.round(performance.now() - t1)
      t1 = performance.now()
      const mass = await api.part.calculateMassProperties({ id })
      const m = Math.round(performance.now() - t1)
      t1 = performance.now()
      const g = await facade.graphic()
      log(
        label,
        'tree',
        tt,
        Object.keys(tree ?? {}).length,
        'mass',
        m,
        'graphic',
        Math.round(performance.now() - t1),
        'volume',
        mass?.volume?.toFixed(1),
        'containers',
        g?.containers?.length,
      )
    }
    // (?vis: the finished solid's graphic is asked for explicitly after each rebuild)
    const vis = new URLSearchParams(location.search).has('vis')
    let solids = []
    if (vis) {
      const tree = await facade.tree({ refresh: true })
      solids = Object.values(tree).filter(n => n.class === 'CC_Solid' && !n.members?.consumed?.value).map(n => n.id)
      log('solids', JSON.stringify(solids))
    }
    if (emit && after) await setEmit()
    const visualise = async () => {
      if (!vis) return
      const t1 = performance.now()
      await api.common.requestVisualisation({ ids: solids })
      const g = await facade.graphic()
      const tris = (g?.containers ?? []).reduce((a, c) => a + (c.meshes ?? []).reduce((b, m) => b + (m.indices?.length ?? 0) / 3, 0), 0)
      log('  vis', Math.round(performance.now() - t1), 'containers', g?.containers?.length, 'triangles', tris)
    }
    await measure('initial')
    for (const [name, value] of tests) {
      t = performance.now()
      await api.part.updateExpression({ id, toUpdate: [{ name, value: +value }] })
      log(name, value, 'update', Math.round(performance.now() - t))
      await visualise()
      await measure('  ')
    }
    // (?save=name.ofb: the model as it stands after the tests, saved into cad/out through the dev server)
    if (new URLSearchParams(location.search).get('save')) {
      const name = new URLSearchParams(location.search).get('save')
      const r = await api.common.save({ format: 'OFB', encoding: 'base64' })
      const b64 = r?.content ?? r?.result?.content ?? r
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      log('saved', name, await (await fetch('/__save/' + name, { method: 'POST', body: bytes })).text(), 'bytes')
    }
    log('done')
  } catch (e) {
    log('ERROR', e?.message ?? JSON.stringify(e))
  }
})()
