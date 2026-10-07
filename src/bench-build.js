// (a profiling bench in the browser's own engine: a build script, as the agents write them, replayed
// with every call timed; then rebuilds of the finished model timed)
import { init, WASMClient, BuerliCadFacade } from '@buerli.io/classcad'
init(id => new WASMClient(id, { token: import.meta.env.VITE_CLASSCAD_TOKEN }))
const q = new URLSearchParams(location.search)
const out = (window.bench = [])
const log = (...a) => {
  out.push(a.join(' '))
  document.getElementById('log').textContent = out.join('\n')
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
;(async () => {
  try {
    const facade = new BuerliCadFacade()
    await facade.connect('bench-build')
    const raw = facade.api.v1
    const calls = []
    // the script api: api.v1.<domain>.<method>(params) → { result, maxLevel }, every call timed
    const v1 = new Proxy(
      {},
      {
        get: (_, dom) =>
          new Proxy(
            {},
            {
              get:
                (_, k) =>
                async (p, ...rest) => {
                  const t0 = performance.now()
                  try {
                    return { result: await raw[dom][k](p, ...rest), maxLevel: 31, messages: [] }
                  } finally {
                    calls.push({
                      dom,
                      k,
                      name: Array.isArray(p) ? (p[0]?.name ?? '') : (p?.name ?? ''),
                      ms: performance.now() - t0,
                    })
                  }
                },
            },
          ),
      },
    )
    const api = { v1, tree: () => facade.tree() }
    // (the build scripts: cad/build.js, the model's own, and the earlier ones in cad/builds; ?build=original)
    const builds = import.meta.glob(['../cad/build.js', '../cad/builds/*.js'], { query: '?raw', import: 'default' })
    const want = q.get('build') ?? 'build'
    const key = Object.keys(builds).find(k => k.endsWith('/' + want.replace(/\.js$/, '') + '.js'))
    if (!key) throw new Error('no build ' + want + ' in ' + Object.keys(builds).join(', '))
    const base = await builds[key]()
    const stops = q.get('stops')?.split(',') ?? [null]
    const excludes = q.get('ex')?.split(';') ?? null
    let report
    for (const [stop, ex] of excludes ? excludes.map(e => ['end', e]) : stops.map(s => [s, ''])) {
      globalThis.__EXCLUDE = ex ? ex.split(',') : []
      calls.length = 0
      let src = base.replace(/\['lengthIn',\s*[\d.]+\]/, `['lengthIn', ${q.get('L') ?? 10}]`)
      // (cut off before a section: the model as it stands there)
      if (stop) {
        const at = src.indexOf(`// =========================== ${stop}.`)
        if (at > 0) src = src.slice(0, at) + 'return report\n'
      }
      await raw.common.clear()
      const t0 = performance.now()
      report = await new AsyncFunction('api', src)(api)
      const pid = Object.values(await facade.tree()).find(n => n.class === 'CC_Part')?.id
      const regen = []
      // (each rebuild checked: the volume the original model has at that length)
      const REF = { 12: 185287.7, 10: 165418.2, 16: 220099.8 }
      // (?seq=name:value,... instead: any parameters, one after another, each rebuild timed)
      const seq =
        q
          .get('seq')
          ?.split(',')
          .map(s => s.split(':')) ?? [12, 10, 16, 10].map(v => ['lengthIn', v])
      for (const [name, value] of seq) {
        const t1 = performance.now()
        let err = ''
        try {
          await raw.part.updateExpression({ id: pid, toUpdate: [{ name, value: +value }] })
        } catch (e) {
          err = '!'
        }
        const ms = Math.round(performance.now() - t1)
        const v = (await raw.part.calculateMassProperties({ id: pid }))?.volume
        regen.push(
          q.get('seq')
            ? `${name}=${value} ${ms}ms/${v?.toFixed(1)}${err}`
            : `${ms}ms/${v?.toFixed(0)}(${(v - REF[value]).toFixed(0)})${err}`,
        )
      }
      // (?save=name.ofb: the model as it stands, saved into cad/out through the dev server; gzip it into
      // public/handguard.ofb.gz for the shop)
      if (q.get('save')) {
        const r = await raw.common.save({ format: 'OFB', encoding: 'base64' })
        const b64 = r?.content ?? r?.result?.content ?? r
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        log(
          'saved',
          q.get('save'),
          await (await fetch('/__save/' + q.get('save'), { method: 'POST', body: bytes })).text(),
          'bytes',
        )
      }
      const nodes = Object.values(await facade.tree()).filter(n => n.parent === pid).length
      log(
        'stop',
        stop ?? 'end',
        ex ? 'without ' + ex : '',
        'build',
        Math.round(performance.now() - t0),
        'regen',
        regen.join(' '),
        'tree',
        nodes,
      )
    }
    if (stops.length > 1 || excludes) return log('done')
    const by = {}
    for (const c of calls) {
      const key = c.dom + '.' + c.k
      by[key] = (by[key] ?? 0) + c.ms
    }
    log(
      'by method',
      Object.entries(by)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, v]) => k + ' ' + Math.round(v))
        .join(' | '),
    )
    const feats = calls.filter(
      c =>
        c.dom === 'part' &&
        !['calculateMassProperties', 'getExpression', 'getWorkGeometry', 'expression', 'create'].includes(c.k),
    )
    for (const c of feats.sort((a, b) => b.ms - a.ms).slice(0, 25))
      log(String(Math.round(c.ms)).padStart(6), c.k.padEnd(16), c.name)
    log('done')
  } catch (e) {
    log('ERROR', e?.stack ?? e?.message ?? JSON.stringify(e))
  }
})()
