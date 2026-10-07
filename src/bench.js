// (a timing bench for the model in the browser: load, and a rebuild for each test value)
import { init, WASMClient, BuerliCadFacade } from '@buerli.io/classcad'
init(id => new WASMClient(id, { token: import.meta.env.VITE_CLASSCAD_TOKEN }))
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
      const mass = await api.part.calculateMassProperties({ id })
      const m = Math.round(performance.now() - t1)
      t1 = performance.now()
      const g = await facade.graphic()
      log(
        label,
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
    await measure('initial')
    for (const [name, value] of tests) {
      t = performance.now()
      await api.part.updateExpression({ id, toUpdate: [{ name, value: +value }] })
      log(name, value, 'update', Math.round(performance.now() - t))
      await measure('  ')
    }
    log('done')
  } catch (e) {
    log('ERROR', e?.message ?? JSON.stringify(e))
  }
})()
