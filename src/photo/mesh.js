// The part, as the tracer wants it: its triangles in the room (the same place the drawing puts them),
// in the order of their bounding volume hierarchy, and for each the shading it needs: its vertices'
// normals, and for each of its three edges, where that edge is one of the part's sharp edges (where
// two of the model's faces meet at an angle), the face on the other side, and how far the triangle
// reaches from that edge. With these the tracer rounds every sharp edge a little (a machined part's
// edges are broken; a model's are knives), so that the edges catch the light as a real part's do.
import * as THREE from 'three'
import { buildBVH } from './bvh'

const SHARP = Math.cos((20 * Math.PI) / 180)

export function prepare(body, matrix) {
  const g = body.geometry
  const P = g.attributes.position.array
  const N = g.attributes.normal.array
  const I = g.index.array
  const nt = I.length / 3
  const nm = new THREE.Matrix3().getNormalMatrix(matrix)
  const v = new THREE.Vector3()

  // the vertices in the room
  const nv = P.length / 3
  const wp = new Float32Array(nv * 3)
  const wn = new Float32Array(nv * 3)
  for (let i = 0; i < nv; i++) {
    v.fromArray(P, i * 3)
      .applyMatrix4(matrix)
      .toArray(wp, i * 3)
    v.fromArray(N, i * 3)
      .applyMatrix3(nm)
      .normalize()
      .toArray(wn, i * 3)
  }

  // which of the model's faces each triangle belongs to (no edge inside a face is sharp)
  const face = new Int32Array(nt).fill(-1)
  body.faces.forEach((fc, k) => {
    for (let t = fc.i0 / 3; t < (fc.i0 + fc.ni) / 3; t++) face[t] = k
  })

  // each triangle's own normal, turned to agree with its vertices' (the model's normals point out)
  const fn = new Float32Array(nt * 3)
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    s = new THREE.Vector3()
  for (let t = 0; t < nt; t++) {
    a.fromArray(wp, I[t * 3] * 3)
    b.fromArray(wp, I[t * 3 + 1] * 3)
    c.fromArray(wp, I[t * 3 + 2] * 3)
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize()
    s.fromArray(wn, I[t * 3] * 3)
      .add(v.fromArray(wn, I[t * 3 + 1] * 3))
      .add(v.fromArray(wn, I[t * 3 + 2] * 3))
    if (n.dot(s) < 0) n.negate()
    n.toArray(fn, t * 3)
  }

  // the edges, found by where their ends are (each face has vertices of its own)
  const key = i =>
    `${Math.round(wp[i * 3] * 1e3)},${Math.round(wp[i * 3 + 1] * 1e3)},${Math.round(wp[i * 3 + 2] * 1e3)}`
  const weld = new Map()
  const id = new Uint32Array(nv)
  for (let i = 0; i < nv; i++) {
    const k = key(i)
    if (!weld.has(k)) weld.set(k, weld.size)
    id[i] = weld.get(k)
  }
  const edges = new Map()
  // (edge e of a triangle is the one opposite its vertex e)
  const ends = [
    [1, 2],
    [2, 0],
    [0, 1],
  ]
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const p = id[I[t * 3 + ends[e][0]]],
        q = id[I[t * 3 + ends[e][1]]]
      const k = p < q ? p * 4194304 + q : q * 4194304 + p
      const list = edges.get(k)
      if (list) list.push(t * 3 + e)
      else edges.set(k, [t * 3 + e])
    }
  }

  // the triangles, flat: positions (v0, v1 - v0, v2 - v0), and their shading
  const tri = new Float32Array(nt * 9)
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) tri[t * 9 + k * 3 + j] = wp[I[t * 3 + k] * 3 + j]
  const bvh = buildBVH(tri)
  const tris = new Float32Array(nt * 12)
  const shade = new Float32Array(nt * 28)
  for (let j = 0; j < nt; j++) {
    const t = bvh.order[j]
    const o = j * 12
    for (let k = 0; k < 3; k++) {
      const v0 = tri[t * 9 + k]
      tris[o + k] = v0
      tris[o + 4 + k] = tri[t * 9 + 3 + k] - v0
      tris[o + 8 + k] = tri[t * 9 + 6 + k] - v0
    }
    const h = j * 28
    for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) shade[h + k * 4 + q] = wn[I[t * 3 + k] * 3 + q]
    // the area twice over, for how far the triangle reaches from each edge
    a.fromArray(tri, t * 9)
    b.fromArray(tri, t * 9 + 3)
    c.fromArray(tri, t * 9 + 6)
    const area2 = b.clone().sub(a).cross(c.clone().sub(a)).length()
    const vs = [a, b, c]
    for (let e = 0; e < 3; e++) {
      const len = vs[ends[e][0]].distanceTo(vs[ends[e][1]])
      shade[h + 24 + e] = len > 0 ? area2 / len : 0
      const p = id[I[t * 3 + ends[e][0]]],
        q = id[I[t * 3 + ends[e][1]]]
      const list = edges.get(p < q ? p * 4194304 + q : q * 4194304 + p) ?? []
      const other = list.find(x => ((x / 3) | 0) !== t)
      if (other === undefined) continue
      const u = (other / 3) | 0
      if (face[u] === face[t]) continue
      const d = fn[t * 3] * fn[u * 3] + fn[t * 3 + 1] * fn[u * 3 + 1] + fn[t * 3 + 2] * fn[u * 3 + 2]
      if (d > SHARP) continue
      shade[h + 12 + e * 4] = fn[u * 3]
      shade[h + 12 + e * 4 + 1] = fn[u * 3 + 1]
      shade[h + 12 + e * 4 + 2] = fn[u * 3 + 2]
      shade[h + 12 + e * 4 + 3] = 1
    }
  }
  const box = new THREE.Box3().setFromArray(wp)
  return { tris, shade, nodes: bvh.nodes, triangles: nt, nodeCount: bvh.count, box }
}
