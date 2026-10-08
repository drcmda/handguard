// A bounding volume hierarchy over the part's triangles, for the tracer: binned SAH, built on the CPU
// (the part has some ten thousand triangles: a few milliseconds), flattened for the GPU. A node is
// 8 words: its box's min (3 floats), then its first child or, for a leaf, its first triangle (u32);
// its box's max (3 floats), then how many triangles a leaf holds (u32; 0 for an inner node, whose
// two children sit side by side).
const BINS = 16
const LEAF = 4

export function buildBVH(tri) {
  const n = tri.length / 9
  const lo = new Float32Array(n * 3)
  const hi = new Float32Array(n * 3)
  const mid = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[i * 9 + k],
        b = tri[i * 9 + 3 + k],
        c = tri[i * 9 + 6 + k]
      lo[i * 3 + k] = Math.min(a, b, c)
      hi[i * 3 + k] = Math.max(a, b, c)
      mid[i * 3 + k] = (lo[i * 3 + k] + hi[i * 3 + k]) / 2
    }
  }
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  const buf = new ArrayBuffer(Math.max(1, 2 * n) * 32)
  const f = new Float32Array(buf)
  const u = new Uint32Array(buf)
  let nodes = 1

  const area = (x0, y0, z0, x1, y1, z1) => {
    const dx = x1 - x0,
      dy = y1 - y0,
      dz = z1 - z0
    return dx < 0 ? 0 : dx * dy + dy * dz + dz * dx
  }
  // (bins: count, then a box, per bin)
  const binN = new Uint32Array(BINS)
  const binB = new Float32Array(BINS * 6)
  const leftA = new Float32Array(BINS),
    leftN = new Uint32Array(BINS)

  const stack = [[0, 0, n]]
  while (stack.length) {
    const [node, first, count] = stack.pop()
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity
    let c0 = [Infinity, Infinity, Infinity],
      c1 = [-Infinity, -Infinity, -Infinity]
    for (let j = first; j < first + count; j++) {
      const t = order[j] * 3
      x0 = Math.min(x0, lo[t])
      y0 = Math.min(y0, lo[t + 1])
      z0 = Math.min(z0, lo[t + 2])
      x1 = Math.max(x1, hi[t])
      y1 = Math.max(y1, hi[t + 1])
      z1 = Math.max(z1, hi[t + 2])
      for (let k = 0; k < 3; k++) {
        c0[k] = Math.min(c0[k], mid[t + k])
        c1[k] = Math.max(c1[k], mid[t + k])
      }
    }
    const o = node * 8
    f[o] = x0
    f[o + 1] = y0
    f[o + 2] = z0
    f[o + 4] = x1
    f[o + 5] = y1
    f[o + 6] = z1
    const leaf = () => {
      u[o + 3] = first
      u[o + 7] = count
    }
    if (count <= LEAF) {
      leaf()
      continue
    }

    // the cheapest split by the surface area heuristic, over every axis, in bins
    let best = Infinity,
      bestAxis = -1,
      bestBin = 0
    for (let axis = 0; axis < 3; axis++) {
      const span = c1[axis] - c0[axis]
      if (span < 1e-9) continue
      binN.fill(0)
      for (let b = 0; b < BINS; b++) binB.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], b * 6)
      const k = BINS / span
      for (let j = first; j < first + count; j++) {
        const t = order[j] * 3
        const b = Math.min(BINS - 1, ((mid[t + axis] - c0[axis]) * k) | 0)
        binN[b]++
        const q = b * 6
        binB[q] = Math.min(binB[q], lo[t])
        binB[q + 1] = Math.min(binB[q + 1], lo[t + 1])
        binB[q + 2] = Math.min(binB[q + 2], lo[t + 2])
        binB[q + 3] = Math.max(binB[q + 3], hi[t])
        binB[q + 4] = Math.max(binB[q + 4], hi[t + 1])
        binB[q + 5] = Math.max(binB[q + 5], hi[t + 2])
      }
      let ax0 = Infinity,
        ay0 = Infinity,
        az0 = Infinity,
        ax1 = -Infinity,
        ay1 = -Infinity,
        az1 = -Infinity,
        an = 0
      for (let b = 0; b < BINS - 1; b++) {
        const q = b * 6
        an += binN[b]
        ax0 = Math.min(ax0, binB[q])
        ay0 = Math.min(ay0, binB[q + 1])
        az0 = Math.min(az0, binB[q + 2])
        ax1 = Math.max(ax1, binB[q + 3])
        ay1 = Math.max(ay1, binB[q + 4])
        az1 = Math.max(az1, binB[q + 5])
        leftN[b] = an
        leftA[b] = an ? area(ax0, ay0, az0, ax1, ay1, az1) : 0
      }
      ax0 = Infinity
      ay0 = Infinity
      az0 = Infinity
      ax1 = -Infinity
      ay1 = -Infinity
      az1 = -Infinity
      an = 0
      for (let b = BINS - 1; b > 0; b--) {
        const q = b * 6
        an += binN[b]
        ax0 = Math.min(ax0, binB[q])
        ay0 = Math.min(ay0, binB[q + 1])
        az0 = Math.min(az0, binB[q + 2])
        ax1 = Math.max(ax1, binB[q + 3])
        ay1 = Math.max(ay1, binB[q + 4])
        az1 = Math.max(az1, binB[q + 5])
        if (!an || !leftN[b - 1]) continue
        const cost = leftA[b - 1] * leftN[b - 1] + area(ax0, ay0, az0, ax1, ay1, az1) * an
        if (cost < best) {
          best = cost
          bestAxis = axis
          bestBin = b
        }
      }
    }
    const here = area(x0, y0, z0, x1, y1, z1) * count
    if (bestAxis < 0 || (best >= here && count <= 12)) {
      leaf()
      continue
    }

    // partition the triangles round the split
    const k = BINS / (c1[bestAxis] - c0[bestAxis])
    let i = first,
      j = first + count - 1
    while (i <= j) {
      const b = Math.min(BINS - 1, ((mid[order[i] * 3 + bestAxis] - c0[bestAxis]) * k) | 0)
      if (b < bestBin) i++
      else {
        const s = order[i]
        order[i] = order[j]
        order[j] = s
        j--
      }
    }
    const nl = i - first
    if (nl === 0 || nl === count) {
      leaf()
      continue
    }
    const left = nodes
    nodes += 2
    u[o + 3] = left
    u[o + 7] = 0
    stack.push([left, first, nl], [left + 1, first + nl, count - nl])
  }
  return { nodes: new Float32Array(buf, 0, nodes * 8), count: nodes, order }
}
