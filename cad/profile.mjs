// Profiles a build script against the session: every part/sketch call timed by the feature it makes,
// then a rebuild of the finished model timed (lengthIn changed and set back).
//   CC_WS=… node cad/runner.mjs cad/profile.mjs <build.js> [lengthIn]
import fs from 'node:fs'
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

export default async function (api, [file, length = '10', exclude = '']) {
  globalThis.__EXCLUDE = exclude ? exclude.split(',') : []
  let src = fs.readFileSync(file, 'utf8')
  src = src.replace(/\['lengthIn',\s*[\d.]+\]/, `['lengthIn', ${length}]`)
  const timings = []
  const timed = (obj, dom) =>
    new Proxy(obj, {
      get(t, k) {
        const f = t[k]
        if (typeof f !== 'function') return f
        return async (o, ...rest) => {
          const t0 = performance.now()
          try {
            return await f.call(t, o, ...rest)
          } finally {
            timings.push({ dom, k, name: Array.isArray(o) ? o[0]?.name ?? '' : o?.name ?? '', ms: performance.now() - t0 })
          }
        }
      },
    })
  const part = timed(api.v1.part, 'part'), sketch = timed(api.v1.sketch, 'sketch')
  const v1 = new Proxy(api.v1, { get: (t, k) => (k === 'part' ? part : k === 'sketch' ? sketch : t[k]) })
  const api2 = new Proxy(api, { get: (t, k) => (k === 'v1' ? v1 : t[k]) })
  await api.v1.common.clear()
  if (process.env.FACET) { const [c, a] = process.env.FACET.split(',').map(Number); await api.v1.common.setFacetingParameters({ chordHeightTol: c, angleTol: a ?? 0 }) }
  const t0 = performance.now()
  const report = await new AsyncFunction('api', src)(api2)
  const build = performance.now() - t0
  // the features, by time (sketch calls folded into the sketch they belong to: the last named one)
  const feat = timings.filter(x => x.dom === 'part' && !['calculateMassProperties', 'getExpression', 'getWorkGeometry', 'expression', 'create'].includes(x.k))
  const masses = timings.filter(x => x.k === 'calculateMassProperties').reduce((a, x) => a + x.ms, 0)
  const sk = timings.filter(x => x.dom === 'sketch').reduce((a, x) => a + x.ms, 0)
  // a rebuild, as the shop does it
  const tree = await api.tree()
  const pid = Object.values(tree).find(n => n.class === 'CC_Part')?.id
  const regen = []
  for (const v of [+length + 2, +length]) {
    const t1 = performance.now()
    await api.v1.part.updateExpression({ id: pid, toUpdate: [{ name: 'lengthIn', value: v }] })
    regen.push(Math.round(performance.now() - t1))
  }
  const vol = (await api.v1.part.calculateMassProperties({ id: pid })).result.volume
  if (exclude) return console.log(JSON.stringify({ exclude, regen, volume: +vol.toFixed(1) }))
  console.log(JSON.stringify({ build: Math.round(build), sketchCalls: Math.round(sk), massCalls: Math.round(masses), regen, volume: +vol.toFixed(1), features: feat.length, final: report?.final?.volume_mm3 }))
  for (const x of feat.sort((a, b) => b.ms - a.ms).slice(0, 40)) console.log(String(Math.round(x.ms)).padStart(6), x.k.padEnd(16), x.name)
}
