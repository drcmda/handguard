// (a profiling bench in the browser's own engine: a build script, as the agents write them, replayed
// with every call timed; then rebuilds of the finished model timed)
import { init, WASMClient, BuerliCadFacade } from '@buerli.io/classcad'
const wasm = new URLSearchParams(location.search).get('wasm')
init(id => new WASMClient(id, { token: import.meta.env.VITE_CLASSCAD_TOKEN, ...(wasm && { url: `/wasm/${wasm}` }) }))
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
        // (the model up to there, still finished with the final subtraction of what it has collected)
        const end = src.indexOf('// =========================== END')
        if (at > 0) src = src.slice(0, at) + (end > at ? src.slice(end) : 'return report\n')
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
      // (?probe: how the engine rebuilds: an expression nothing uses, one only a late feature uses, a full recalc)
      if (q.get('probe')) {
        const time = async f => {
          const t = performance.now()
          await f()
          return Math.round(performance.now() - t)
        }
        await raw.part.expression({ id: pid, toCreate: [{ name: 'probeUnused', value: 1 }] })
        const r = {}
        r.unused = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'probeUnused', value: 2 }] }))
        r.unused2 = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'probeUnused', value: 3 }] }))
        r.qdGroove = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'qdGrooveWIn', value: 0.086 }] }))
        r.qdGroove2 = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'qdGrooveWIn', value: 0.085 }] }))
        r.length = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'lengthIn', value: 10.5 }] }))
        r.length2 = await time(() => raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'lengthIn', value: 10 }] }))
        r.recalc = await time(() => raw.common.recalc())
        r.graphic = await time(() => facade.graphic())
        r.mass = await time(() => raw.part.calculateMassProperties({ id: pid }))
        log('probe', JSON.stringify(r))
      }
      // (?profile: what each feature costs a rebuild: the rollback bar moved past one feature after
      // another, and at each stop a change of length timed; the differences are the features' shares)
      if (q.get('profile')) {
        const tree = await facade.tree()
        const bar = Object.values(tree).find(n => n.class === 'CC_RollbackBar')
        const seq = tree[bar.parent]
        const kids = (seq.children ?? []).map(c => (typeof c === 'object' ? c.id : c))
        // (the sequence holds references; each names its feature)
        const feats = kids
          .filter(id => id !== bar.id)
          .map(id => tree[tree[id]?.members?.refObj?.value] ?? tree[id])
          .filter(Boolean)
        log('profile', feats.length, 'features in', seq.class)
        const measure = async () => {
          let sum = 0
          for (const value of [10.5, 10]) {
            const t = performance.now()
            await raw.part.updateExpression({ id: pid, toUpdate: [{ name: 'lengthIn', value }] })
            sum += performance.now() - t
          }
          return sum / 2
        }
        // (only where the bar can stand: before a feature, work geometry or sketch)
        const stops = []
        for (const f of feats) {
          // (work geometry and sketches go with the feature after them)
          if (/WorkPoint|WorkAxis|WorkPlane|WorkCSys|Sketch/.test(f.class)) continue
          try {
            await raw.part.operationMoveBefore({ id: pid, featureId: f.id })
            stops.push(f)
          } catch {}
        }
        log('classes', [...new Set(feats.map(f => f.class))].join(' '), '| stops', stops.length)
        await raw.part.operationMoveBefore({ id: pid, featureId: stops[0].id })
        let prev = await measure()
        const base0 = prev
        const rows = []
        for (let k = 0; k < stops.length; k++) {
          if (stops[k + 1]) await raw.part.operationMoveBefore({ id: pid, featureId: stops[k + 1].id })
          else await raw.part.operationMoveToEnd({ id: pid })
          const t = await measure()
          rows.push([t - prev, stops[k].class.replace('CC_', ''), stops[k].name, t])
          prev = t
          window.profile = rows
        }
        log('profile: empty', Math.round(base0), 'full', Math.round(prev))
        for (const [ms, cls, name] of rows.slice().sort((a, b) => b[0] - a[0]).slice(0, 45))
          log(String(Math.round(ms)).padStart(6), cls.padEnd(22), name)
        const by = {}
        for (const [ms, cls] of rows) by[cls] = (by[cls] ?? 0) + ms
        log('by class', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v)).join(' | '))
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
