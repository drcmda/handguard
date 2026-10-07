// The model's expressions, worked out as the engine works them out: every one that is not a plain
// number is a formula of others (expressions.json has both, as the model has them). Set the shop's
// parameters, and what follows from them follows: the counts, the layout, before ClassCAD answers.
const FN = {
  div: (a, b) => Math.floor(a / b),
  fmod: (a, b) => a % b,
  sign: Math.sign,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  atan2: Math.atan2,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
}
const js = expr => expr.replace(/C:PI/g, 'PI').replace(/\^/g, '**')

export function evaluate(expressions, set = {}) {
  const out = new Map()
  const pending = []
  for (const x of expressions) {
    if (x.name in set) out.set(x.name, +set[x.name])
    else if (!x.expr) out.set(x.name, x.value)
    else pending.push(x)
  }
  // (in as many rounds as it takes: a formula is worked out once all it names are known)
  for (let round = 0; round < 64 && pending.length; round++) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const x = pending[i]
      const names = x.expr.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []
      if (!names.every(n => n in FN || n === 'C' || n === 'PI' || out.has(n))) continue
      const scope = { PI: Math.PI, ...FN }
      for (const n of names) if (out.has(n)) scope[n] = out.get(n)
      const keys = Object.keys(scope)
      out.set(x.name, Function(...keys, `return (${js(x.expr)})`)(...keys.map(k => scope[k])))
      pending.splice(i, 1)
    }
  }
  return out
}
